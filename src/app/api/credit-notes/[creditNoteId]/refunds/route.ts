import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { getSalesCreditNoteById } from "@/lib/data/credit-notes";
import { listCreditNoteRefunds } from "@/lib/data/credit-note-refunds";

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
  const note = await getSalesCreditNoteById(creditNoteId);
  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, note.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const refunds = await listCreditNoteRefunds(creditNoteId);
  return NextResponse.json({ refunds });
}
