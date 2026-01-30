import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getVendorCreditNoteById,
  updateVendorCreditNote,
} from "@/lib/data/vendor-credit-notes";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ creditNoteId: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creditNoteId } = await context.params;
  const note = await getVendorCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const lockedPeriod = await findFiledVatPeriod(note.companyId, note.issueDate);
  if (lockedPeriod) {
    return NextResponse.json({ error: "VAT period is filed" }, { status: 400 });
  }

  await updateVendorCreditNote(creditNoteId, { status: "canceled" });

  await recordAuditEvent({
    companyId: note.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "vendor_credit_note.cancel",
    entity: "vendor_credit_note",
    entityId: note.id,
    metadata: { creditNumber: note.creditNumber },
  });

  return NextResponse.json({ ok: true });
}
