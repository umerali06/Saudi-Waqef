import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { billUpdateSchema } from "@/lib/validators/purchases";
import { getPurchaseBillById, updatePurchaseBill } from "@/lib/data/purchase-bills";
import { getVendorById } from "@/lib/data/vendors";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ billId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, bill.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ bill });
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { billId } = await context.params;
  const current = await getPurchaseBillById(billId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (current.status !== "draft") {
    return NextResponse.json({ error: "Bill is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, current.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetDate = parsed.data.billDate ?? current.billDate;
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

  let vendor = null;
  if (parsed.data.vendorId && parsed.data.vendorId !== current.vendorId) {
    vendor = await getVendorById(parsed.data.vendorId);
    if (!vendor || vendor.companyId !== current.companyId) {
      return NextResponse.json({ error: "Invalid vendor" }, { status: 400 });
    }
    if (vendor.status === "inactive") {
      return NextResponse.json({ error: "Vendor is inactive" }, { status: 400 });
    }
  }

  const lines = parsed.data.lines ?? current.lines;
  const computedLines = [];

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

  await updatePurchaseBill(billId, {
    vendorId: vendor?.id ?? current.vendorId,
    vendorName: vendor?.name ?? current.vendorName,
    vendorVatNumber: vendor ? vendor.vatNumber ?? null : current.vendorVatNumber ?? null,
    remittanceAddress: vendor
      ? vendor.remittanceAddress ?? null
      : current.remittanceAddress ?? null,
    billDate: parsed.data.billDate ?? current.billDate,
    dueDate: parsed.data.dueDate ?? current.dueDate,
    currency: parsed.data.currency ?? current.currency,
    paymentTermId:
      parsed.data.paymentTermId !== undefined
        ? parsed.data.paymentTermId
        : current.paymentTermId ?? null,
    vendorBillNumber:
      parsed.data.vendorBillNumber !== undefined
        ? parsed.data.vendorBillNumber
        : current.vendorBillNumber ?? null,
    notes: parsed.data.notes ?? current.notes ?? null,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    balance: total - current.amountPaid - current.amountCredited,
    lines: computedLines,
  });

  await recordAuditEvent({
    companyId: current.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "bill.update",
    entity: "purchase_bill",
    entityId: billId,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

