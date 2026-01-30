import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth-helpers";
import { inviteSchema } from "@/lib/validators/auth";
import { createInvite } from "@/lib/data/invites";
import { requireAdminAccess } from "@/lib/access";
import { checkUserLimit } from "@/lib/billing/limits";
import { getCompanyById } from "@/lib/data/companies";
import { queueEmailWithDispatch } from "@/lib/email/queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invite payload" },
      { status: 400 }
    );
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitCheck = await checkUserLimit(parsed.data.companyId);
  if (!limitCheck.ok) {
    return NextResponse.json(
      { error: limitCheck.reason ?? "Plan limit reached" },
      { status: 400 }
    );
  }

  const inviteId = uuidv4();
  const token = uuidv4().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await createInvite({
    id: inviteId,
    token,
    email: parsed.data.email,
    companyId: parsed.data.companyId,
    role: parsed.data.role,
    expiresAt,
  });

  const company = await getCompanyById(parsed.data.companyId);
  const locale = company?.defaultLanguage ?? "ar";
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl}/invite/${token}`;
  const subject =
    locale === "ar"
      ? `دعوة للانضمام إلى ${company?.name ?? "Saudi Waqef"}`
      : `You're invited to join ${company?.name ?? "Saudi Waqef"}`;
  const body =
    locale === "ar"
      ? `<p>تمت دعوتك للانضمام إلى ${company?.name ?? "Saudi Waqef"}.</p><p><a href="${inviteUrl}">قبول الدعوة</a></p>`
      : `<p>You have been invited to join ${company?.name ?? "Saudi Waqef"}.</p><p><a href="${inviteUrl}">Accept invite</a></p>`;

  await queueEmailWithDispatch({
    companyId: parsed.data.companyId,
    to: parsed.data.email,
    subject,
    body,
    sourceType: "invite",
    sourceId: inviteId,
    meta: { role: parsed.data.role },
  });

  return NextResponse.json({
    inviteId,
    token,
  });
}
