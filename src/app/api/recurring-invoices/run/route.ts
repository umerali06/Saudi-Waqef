import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { runRecurringInvoices } from "@/lib/accounting/recurring";
import { riyadhDate } from "@/lib/utils/riyadh";

export const runtime = "nodejs";

type RequestBody = {
  companyId?: string;
};

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

  const { created, failed } = await runRecurringInvoices(companyId, riyadhDate());

  return NextResponse.json({ ok: true, created, failed });
}
