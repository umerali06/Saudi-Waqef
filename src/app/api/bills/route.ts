import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { billSchema } from "@/lib/validators/purchases";
import { listPurchaseBills, createPurchaseBill } from "@/lib/data/purchase-bills";
import { getVendorById } from "@/lib/data/vendors";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { normalizeSearch } from "@/lib/utils/search";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

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
  const vendorId = searchParams.get("vendorId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const overdue = parseBoolean(searchParams.get("overdue"));
  const q = normalizeSearch(searchParams.get("q") ?? "");
  const minTotal = searchParams.get("minTotal");
  const maxTotal = searchParams.get("maxTotal");

  const bills = await listPurchaseBills(companyId);
  const today = new Date().toISOString().slice(0, 10);

  let filtered = bills;
  if (status && status !== "all") {
    filtered = filtered.filter((bill) => bill.status === status);
  }
  if (vendorId) {
    filtered = filtered.filter((bill) => bill.vendorId === vendorId);
  }
  if (from) {
    filtered = filtered.filter((bill) => bill.billDate >= from);
  }
  if (to) {
    filtered = filtered.filter((bill) => bill.billDate <= to);
  }
  if (overdue === true) {
    filtered = filtered.filter(
      (bill) =>
        bill.balance > 0 && bill.dueDate < today && bill.status !== "canceled"
    );
  }
  if (q) {
    filtered = filtered.filter((bill) => {
      return (
        normalizeSearch(bill.billNumber).includes(q) ||
        normalizeSearch(bill.vendorName).includes(q) ||
        normalizeSearch(bill.vendorBillNumber ?? "").includes(q)
      );
    });
  }
  if (minTotal) {
    const value = Number(minTotal);
    if (!Number.isNaN(value)) {
      filtered = filtered.filter((bill) => bill.total >= value);
    }
  }
  if (maxTotal) {
    const value = Number(maxTotal);
    if (!Number.isNaN(value)) {
      filtered = filtered.filter((bill) => bill.total <= value);
    }
  }

  filtered.sort((a, b) => b.billDate.localeCompare(a.billDate));

  return NextResponse.json({
    bills: filtered.map((bill) => ({
      id: bill.id,
      billNumber: bill.billNumber,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      status: bill.status,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      total: bill.total,
      balance: bill.balance,
      currency: bill.currency,
      vendorBillNumber: bill.vendorBillNumber ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billSchema.safeParse(body);
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
    parsed.data.billDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const vendor = await getVendorById(parsed.data.vendorId);
  if (!vendor || vendor.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid vendor" }, { status: 400 });
  }
  if (vendor.status === "inactive") {
    return NextResponse.json({ error: "Vendor is inactive" }, { status: 400 });
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
      defaults.defaultPurchaseTaxCategoryId ??
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
      expenseAccountId: item.expenseAccountId ?? defaults.purchasesAccountId ?? null,
    });
  }

  const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = computedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  );
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  const { id, billNumber } = await createPurchaseBill({
    companyId: parsed.data.companyId,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorVatNumber: vendor.vatNumber ?? null,
    remittanceAddress: vendor.remittanceAddress ?? null,
    vendorBillNumber: parsed.data.vendorBillNumber ?? null,
    billDate: parsed.data.billDate,
    dueDate: parsed.data.dueDate,
    currency: parsed.data.currency ?? vendor.currency ?? "SAR",
    paymentTermId: parsed.data.paymentTermId ?? vendor.paymentTermId ?? null,
    notes: parsed.data.notes ?? null,
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

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.create",
    entity: "purchase_bill",
    entityId: id,
    metadata: { billNumber, total },
  });

  return NextResponse.json({ billId: id, billNumber });
}

