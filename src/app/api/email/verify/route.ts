import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { sendEmail } from "@/lib/email/sender";

export const runtime = "nodejs";

type VerifyBody = {
  companyId?: string;
  to?: string;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as VerifyBody | null;
  const companyId = body?.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const to = body?.to ?? user.email ?? null;
  if (!to) {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  await sendEmail({
    to,
    subject: "SMTP verification - Saudi Waqef",
    body: "<p>SMTP verification succeeded.</p>",
  });

  return NextResponse.json({ ok: true });
}
