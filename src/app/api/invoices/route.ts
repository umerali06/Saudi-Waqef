import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { invoiceSchema } from "@/lib/validators/sales";
import { listSalesInvoices, createSalesInvoice } from "@/lib/data/sales-invoices";
import { getCustomerById } from "@/lib/data/customers";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { normalizeSearch } from "@/lib/utils/search";
import { applyItemStockDeltas } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import { createTelemetryEvent } from "@/lib/data/telemetry";

export const runtime = "nodejs";

const parseBoolean = (value: string | null) => {
  if (!value) {
    return undefined;
  }
  const normalized = normalizeSearch(value);
  if (["true", "yes", "1", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "0", "n"].includes(normalized)) {
    return false;
  }
  return undefined;
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAccountingAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const overdue = parseBoolean(searchParams.get("overdue"));
  const q = normalizeSearch(searchParams.get("q") ?? "");
  const minTotal = searchParams.get("minTotal");
  const maxTotal = searchParams.get("maxTotal");

  const invoices = await listSalesInvoices(companyId);
  const today = new Date().toISOString().slice(0, 10);

  let filtered = invoices;
  if (status && status !== "all") {
    filtered = filtered.filter((invoice) => invoice.status === status);
  }
  if (customerId) {
    filtered = filtered.filter((invoice) => invoice.customerId === customerId);
  }
  if (from) {
    filtered = filtered.filter((invoice) => invoice.invoiceDate >= from);
  }
  if (to) {
    filtered = filtered.filter((invoice) => invoice.invoiceDate <= to);
  }
  if (overdue === true) {
    filtered = filtered.filter(
      (invoice) =>
        invoice.balance > 0 &&
        invoice.dueDate < today &&
        invoice.status !== "canceled"
    );
  }
  if (q) {
    filtered = filtered.filter((invoice) => {
      return (
        normalizeSearch(invoice.invoiceNumber).includes(q) ||
        normalizeSearch(invoice.customerName).includes(q)
      );
    });
  }
  if (minTotal) {
    const value = Number(minTotal);
    if (!Number.isNaN(value)) {
      filtered = filtered.filter((invoice) => invoice.total >= value);
    }
  }
  if (maxTotal) {
    const value = Number(maxTotal);
    if (!Number.isNaN(value)) {
      filtered = filtered.filter((invoice) => invoice.total <= value);
    }
  }

  filtered.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

  return NextResponse.json({
    invoices: filtered.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      status: invoice.status,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      total: invoice.total,
      balance: invoice.balance,
      currency: invoice.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lockedPeriod = await findFiledVatPeriod(
    parsed.data.companyId,
    parsed.data.invoiceDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer || customer.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }
  if (customer.status === "blacklisted") {
    return NextResponse.json({ error: "Customer is blacklisted" }, { status: 400 });
  }

  const [items, taxCategories, defaults, config] = await Promise.all([
    listItems(parsed.data.companyId),
    listTaxCategories(parsed.data.companyId),
    getCompanyDefaults(parsed.data.companyId),
    getCompanyConfig(parsed.data.companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));

  const computedLines = [];
  const itemReserveMap = new Map<string, number>();

  for (const line of parsed.data.lines) {
    const item = line.itemId ? itemMap.get(line.itemId) : null;
    if (!item) {
      return NextResponse.json({ error: "Invalid item" }, { status: 400 });
    }

    const unitOptions = [item.baseUnit, item.packUnit].filter(Boolean);
    if (!unitOptions.includes(line.unit)) {
      return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
    }

    const taxCategoryId =
      line.taxCategoryId ??
      item.taxCategoryId ??
      defaults.defaultSalesTaxCategoryId ??
      null;
    const taxCategory = taxCategoryId ? taxMap.get(taxCategoryId) : null;
    const taxRate = taxCategory ? (taxCategory.rate ?? 0) / 100 : 0;

    const amounts = calculateLineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountRate: line.discountRate ?? 0,
      taxRate,
      taxInclusive: Boolean(config.taxInclusive),
    });

    const baseQuantity = toBaseQuantity(line.quantity, line.unit, {
      baseUnit: item.baseUnit,
      packUnit: item.packUnit,
      packSize: item.packSize ?? undefined,
    });

    computedLines.push({
      id: line.id ?? crypto.randomUUID(),
      itemId: item.id,
      description: line.description || item.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discountRate: line.discountRate ?? 0,
      discountAmount: amounts.discountAmount,
      taxCategoryId,
      taxRate,
      taxAmount: amounts.taxAmount,
      netAmount: amounts.netAmount,
      totalAmount: amounts.totalAmount,
      baseQuantity,
    });

    if (item.trackInventory) {
      const current = itemReserveMap.get(item.id) ?? 0;
      itemReserveMap.set(item.id, current + baseQuantity);
      const available = item.stockOnHand - item.stockReserved;
      if (available < baseQuantity) {
        return NextResponse.json({ error: "Insufficient stock" }, { status: 400 });
      }
    }
  }

  const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = computedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  );
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  const { id, invoiceNumber } = await createSalesInvoice({
    companyId: parsed.data.companyId,
    customerId: customer.id,
    customerName: customer.name,
    customerVatNumber: customer.vatNumber ?? null,
    billingAddress: customer.billingAddress ?? null,
    invoiceDate: parsed.data.invoiceDate,
    dueDate: parsed.data.dueDate,
    currency: parsed.data.currency ?? customer.currency ?? "SAR",
    paymentTermId: parsed.data.paymentTermId ?? customer.paymentTermId ?? null,
    notes: parsed.data.notes ?? null,
    terms: parsed.data.terms ?? null,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    amountPaid: 0,
    amountCredited: 0,
    balance: total,
    status: "draft",
    lines: computedLines,
  });

  if (itemReserveMap.size > 0) {
    const updates = Array.from(itemReserveMap.entries()).map(([itemId, qty]) => ({
      itemId,
      stockReservedDelta: qty,
    }));
    await applyItemStockDeltas(updates);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.create",
    entity: "sales_invoice",
    entityId: id,
    metadata: { invoiceNumber, total },
  });

  await createTelemetryEvent({
    name: "invoice.created",
    companyId: parsed.data.companyId,
    userId: user.id,
    metadata: { total },
  });

  return NextResponse.json({ invoiceId: id, invoiceNumber });
}

