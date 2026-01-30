import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorCreditNoteUpdateSchema } from "@/lib/validators/purchases";
import {
  getVendorCreditNoteById,
  updateVendorCreditNote,
} from "@/lib/data/vendor-credit-notes";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
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
  params: Promise<{ creditNoteId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getVendorCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, note.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ creditNote: note });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getVendorCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorCreditNoteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (note.status !== "draft") {
    return NextResponse.json({ error: "Credit note is locked" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const targetDate = parsed.data.issueDate ?? note.issueDate;
  const lockedPeriod = await findFiledVatPeriod(note.companyId, targetDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const bill = await getPurchaseBillById(note.billId);
  if (!bill) {
    return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
  }

  const [items, taxCategories, defaults, config] = await Promise.all([
    listItems(note.companyId),
    listTaxCategories(note.companyId),
    getCompanyDefaults(note.companyId),
    getCompanyConfig(note.companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));

  const inputLines = parsed.data.lines ?? note.lines;
  const computedLines = [];

  for (const line of inputLines) {
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
      billLineId: line.billLineId ?? null,
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
      returnToVendor: line.returnToVendor ?? item.trackInventory,
    });
  }

  const subtotal = computedLines.reduce((sum, line) => sum + line.netAmount, 0);
  const discountTotal = computedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0
  );
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.totalAmount, 0);

  if (total > bill.balance) {
    return NextResponse.json({ error: "Credit exceeds balance" }, { status: 400 });
  }

  await updateVendorCreditNote(creditNoteId, {
    issueDate: parsed.data.issueDate ?? note.issueDate,
    notes: parsed.data.notes ?? note.notes ?? null,
    reason: parsed.data.reason ?? note.reason ?? null,
    subtotal,
    discountTotal,
    taxTotal,
    total,
    lines: computedLines,
  });

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor_credit_note.update",
    entity: "vendor_credit_note",
    entityId: note.id,
    metadata: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ ok: true });
}

