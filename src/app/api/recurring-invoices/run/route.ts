import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listRecurringInvoices, updateRecurringInvoice } from "@/lib/data/recurring-invoices";
import { getCustomerById } from "@/lib/data/customers";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { createSalesInvoice } from "@/lib/data/sales-invoices";
import { applyItemStockDeltas } from "@/lib/data/items";

export const runtime = "nodejs";

type RequestBody = {
  companyId?: string;
};

function addFrequency(date: string, frequency: "weekly" | "monthly") {
  const dt = new Date(date);
  if (frequency === "weekly") {
    dt.setDate(dt.getDate() + 7);
  } else {
    dt.setMonth(dt.getMonth() + 1);
  }
  return dt.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const companyId = body?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [recurring, items, taxCategories, defaults, config] = await Promise.all([
    listRecurringInvoices(companyId),
    listItems(companyId),
    listTaxCategories(companyId),
    getCompanyDefaults(companyId),
    getCompanyConfig(companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const today = new Date().toISOString().slice(0, 10);

  const created: Array<{ recurringId: string; invoiceId: string; invoiceNumber: string }> = [];

  for (const schedule of recurring.filter((r) => r.status === "active" && r.nextRunDate <= today)) {
    const customer = await getCustomerById(schedule.customerId);
    if (!customer || customer.companyId !== companyId) {
      continue;
    }

    const computedLines = [];
    const itemReserveMap = new Map<string, number>();

    for (const line of schedule.template.lines) {
      const item = itemMap.get(line.itemId);
      if (!item) {
        continue;
      }

      const unitOptions = [item.baseUnit, item.packUnit].filter(Boolean);
      if (!unitOptions.includes(line.unit)) {
        continue;
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
      }
    }

    if (computedLines.length === 0) {
      continue;
    }

    const invoiceDate = today;
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + schedule.template.dueDays);

    const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
    const discountTotal = computedLines.reduce((sum, line) => sum + line.discountAmount, 0);
    const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
    const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

    const { id: invoiceId, invoiceNumber } = await createSalesInvoice({
      companyId,
      customerId: customer.id,
      customerName: customer.name,
      customerVatNumber: customer.vatNumber ?? null,
      billingAddress: customer.billingAddress ?? null,
      invoiceDate,
      dueDate: dueDate.toISOString().slice(0, 10),
      currency: customer.currency ?? "SAR",
      paymentTermId: schedule.template.paymentTermId ?? null,
      notes: schedule.template.notes ?? null,
      terms: schedule.template.terms ?? null,
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

    await updateRecurringInvoice(schedule.id, {
      lastRunDate: today,
      nextRunDate: addFrequency(today, schedule.frequency),
    });

    created.push({ recurringId: schedule.id, invoiceId, invoiceNumber });
  }

  return NextResponse.json({ ok: true, created });
}
