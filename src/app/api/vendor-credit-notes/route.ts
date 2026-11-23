import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { vendorCreditNoteSchema } from "@/lib/validators/purchases";
import {
  createVendorCreditNote,
  listVendorCreditNotes,
} from "@/lib/data/vendor-credit-notes";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { listItems } from "@/lib/data/items";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCompanyConfig } from "@/lib/data/company-config";
import { calculateLineAmounts, resolveNoteTaxRate, sumLineAmounts } from "@/lib/utils/invoice";
import { toBaseQuantity } from "@/lib/utils/units";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { normalizeSearch } from "@/lib/utils/search";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import { postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { issueVendorCreditNote } from "@/lib/accounting/purchases";

export const runtime = "nodejs";

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
  const billId = searchParams.get("billId");
  const q = normalizeSearch(searchParams.get("q") ?? "");

  const notes = await listVendorCreditNotes(companyId);
  let filtered = notes;
  if (status && status !== "all") {
    filtered = filtered.filter((note) => note.status === status);
  }
  if (vendorId) {
    filtered = filtered.filter((note) => note.vendorId === vendorId);
  }
  if (billId) {
    filtered = filtered.filter((note) => note.billId === billId);
  }
  if (q) {
    filtered = filtered.filter(
      (note) =>
        normalizeSearch(note.creditNumber).includes(q) ||
        normalizeSearch(note.vendorName).includes(q)
    );
  }

  filtered.sort((a, b) => b.issueDate.localeCompare(a.issueDate));

  return NextResponse.json({
    creditNotes: filtered.map((note) => ({
      id: note.id,
      creditNumber: note.creditNumber,
      billId: note.billId,
      billNumber: note.billNumber,
      vendorId: note.vendorId,
      vendorName: note.vendorName,
      status: note.status,
      issueDate: note.issueDate,
      total: note.total,
      currency: note.currency,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = vendorCreditNoteSchema.safeParse(body);
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
    parsed.data.issueDate
  );
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  const bill = await getPurchaseBillById(parsed.data.billId);
  if (!bill || bill.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid bill" }, { status: 400 });
  }

  if (bill.status === "canceled") {
    return NextResponse.json({ error: "Bill is canceled" }, { status: 400 });
  }
  if (bill.status === "draft") {
    return NextResponse.json({ error: "Bill is not approved" }, { status: 400 });
  }

  const [items, taxCategories, defaults, config] = await Promise.all([
    listItems(parsed.data.companyId),
    listTaxCategories(parsed.data.companyId),
    getCompanyDefaults(parsed.data.companyId),
    getCompanyConfig(parsed.data.companyId),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const originalLines = new Map(bill.lines.map((line) => [line.id, line]));

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
    const taxRate = resolveNoteTaxRate({
      original: line.billLineId ? originalLines.get(line.billLineId) : null,
      taxCategoryId,
      category: taxCategory,
      vatEnabled: config.vatEnabled,
    });

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

    const returnToVendor = line.returnToVendor ?? item.trackInventory;

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
      returnToVendor,
    });
  }

  const { subtotal, discountTotal, taxTotal, total } = sumLineAmounts(computedLines);
  if (parsed.data.status === "draft") {
    const { id, creditNumber } = await createVendorCreditNote({
      companyId: parsed.data.companyId,
      billId: bill.id,
      billNumber: bill.billNumber,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      issueDate: parsed.data.issueDate,
      currency: parsed.data.currency ?? bill.currency,
      notes: parsed.data.notes ?? null,
      reason: parsed.data.reason ?? null,
      subtotal,
      discountTotal,
      taxTotal,
      total,
      status: "draft",
      lines: computedLines,
    });
    await recordAuditEvent({
      companyId: parsed.data.companyId,
      userId: user.id,
      userEmail: user.email ?? undefined,
      action: "vendor_credit_note.create",
      entity: "vendor_credit_note",
      entityId: id,
      metadata: { creditNumber, status: "draft" },
    });
    return NextResponse.json({ creditNoteId: id, creditNumber });
  }

  const closedPeriod = await periodClosedResponse(
    parsed.data.companyId,
    parsed.data.issueDate
  );
  if (closedPeriod) {
    return closedPeriod;
  }

  let issued: Awaited<ReturnType<typeof issueVendorCreditNote>>;
  try {
    issued = await issueVendorCreditNote({
      companyId: parsed.data.companyId,
      create: {
        billId: bill.id,
        issueDate: parsed.data.issueDate,
        currency: parsed.data.currency ?? bill.currency,
        notes: parsed.data.notes ?? null,
        reason: parsed.data.reason ?? null,
        lines: computedLines,
      },
    });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor_credit_note.issue",
    entity: "vendor_credit_note",
    entityId: issued.id,
    metadata: { creditNumber: issued.creditNumber, total: issued.total },
  });

  return NextResponse.json({ creditNoteId: issued.id, creditNumber: issued.creditNumber });
}

