import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { sendEmail } from "@/lib/email/sender";
import { renderBilingualEmail } from "@/lib/email/template";

export const runtime = "nodejs";

type VerifyBody = {
  companyId?: string;
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

  const to = user.email ?? null;
  if (!to) {
    return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });
  }

  try {
    await sendEmail({
      to,
      subject: "اختبار البريد | Email test",
      body: renderBilingualEmail({
        first: "ar",
        ar: { heading: "اختبار البريد", paragraphs: ["إعدادات إرسال البريد تعمل بشكل صحيح."] },
        en: { heading: "Email test", paragraphs: ["Your email settings work correctly."] },
      }),
    });
  } catch (error) {
    console.error("SMTP verification failed:", error);
    return NextResponse.json({ error: "Email could not be sent" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
