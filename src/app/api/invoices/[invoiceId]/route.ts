import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { PostingError, postingErrorResponse } from "@/lib/accounting/errors";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { invoiceUpdateSchema } from "@/lib/validators/sales";
import { getSalesInvoiceById, updateSalesInvoice } from "@/lib/data/sales-invoices";
import { getCustomerById } from "@/lib/data/customers";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts, resolveTaxRate, sumLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { applyItemStockDeltas } from "@/lib/data/items";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import type { InvoiceLine } from "@/lib/data/sales-invoices";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

const buildQuantityMap = (lines: Array<{ itemId?: string | null; baseQuantity: number }>) => {
  const map = new Map<string, number>();
  lines.forEach((line) => {
    if (!line.itemId) {
      return;
    }
    const current = map.get(line.itemId) ?? 0;
    map.set(line.itemId, current + line.baseQuantity);
  });
  return map;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, invoice.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ invoice });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceId } = await context.params;
  const current = await getSalesInvoiceById(invoiceId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = invoiceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (current.status !== "draft") {
    return NextResponse.json({ error: "Invoice is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetDate = parsed.data.invoiceDate ?? current.invoiceDate;
  const lockedPeriod = await findFiledVatPeriod(current.companyId, targetDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const [items, taxCategories, defaults, config] = await Promise.all([
    listItems(current.companyId),
    listTaxCategories(current.companyId),
    getCompanyDefaults(current.companyId),
    getCompanyConfig(current.companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));

  let customer = null;
  if (parsed.data.customerId && parsed.data.customerId !== current.customerId) {
    customer = await getCustomerById(parsed.data.customerId);
    if (!customer || customer.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
    }
  }

  const lines = parsed.data.lines ?? current.lines;
  const computedLines: InvoiceLine[] = [];
  const itemReserveMap = new Map<string, number>();

  for (const line of lines) {
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
    const taxRate = resolveTaxRate(taxCategory, config.vatEnabled);

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
      const currentQty = itemReserveMap.get(item.id) ?? 0;
      itemReserveMap.set(item.id, currentQty + baseQuantity);
    }
  }

  const { subtotal, discountTotal, taxTotal, total } = sumLineAmounts(computedLines);

  try {
    await db.runTransaction(async (tx) => {
      const latest = await getSalesInvoiceById(invoiceId, tx);
      if (latest?.status !== "draft") {
        throw new PostingError("Invoice is locked");
      }

      // Only tracked items reserve stock, so only those can give it back.
      const previousMap = buildQuantityMap(
        latest.lines.filter((line) => line.itemId && itemMap.get(line.itemId)?.trackInventory)
      );
      const updates: Array<{ itemId: string; stockReservedDelta: number }> = [];
      new Set([...itemReserveMap.keys(), ...previousMap.keys()]).forEach((itemId) => {
        const delta = (itemReserveMap.get(itemId) ?? 0) - (previousMap.get(itemId) ?? 0);
        if (delta === 0) {
          return;
        }
        const item = itemMap.get(itemId);
        if (item && delta > 0 && item.stockOnHand - item.stockReserved < delta) {
          throw new PostingError("Insufficient stock");
        }
        updates.push({ itemId, stockReservedDelta: delta });
      });

      await applyItemStockDeltas(updates, tx);
      await updateSalesInvoice(
        invoiceId,
        {
          customerId: customer?.id ?? current.customerId,
          customerName: customer?.name ?? current.customerName,
          customerVatNumber: customer ? customer.vatNumber ?? null : current.customerVatNumber ?? null,
          billingAddress: customer ? customer.billingAddress ?? null : current.billingAddress ?? null,
          invoiceDate: parsed.data.invoiceDate ?? current.invoiceDate,
          dueDate: parsed.data.dueDate ?? current.dueDate,
          currency: parsed.data.currency ?? current.currency,
          paymentTermId:
            parsed.data.paymentTermId !== undefined
              ? parsed.data.paymentTermId
              : current.paymentTermId ?? null,
          notes: parsed.data.notes ?? current.notes ?? null,
          terms: parsed.data.terms ?? current.terms ?? null,
          subtotal,
          discountTotal,
          taxTotal,
          total,
          balance: total,
          lines: computedLines,
        },
        tx
      );
    });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "invoice.update",
    entity: "sales_invoice",
    entityId: invoiceId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

