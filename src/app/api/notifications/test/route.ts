import { NextResponse } from "next/server";
import { z } from "zod";
import type { Locale } from "@/i18n/messages";
import { getSessionUser } from "@/lib/auth-helpers";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { renderTemplate } from "@/lib/notifications/templates";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { requireAdminAccess } from "@/lib/access";

export const runtime = "nodejs";

const schema = z.object({
  companyId: z.string().min(1),
  email: z.string().email(),
  type: z.enum(NOTIFICATION_TYPES),
  locale: z.enum(["ar", "en"]).default("ar"),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rendered = renderTemplate(
    parsed.data.type,
    parsed.data.locale as Locale
  );

  await queueEmailWithDispatch({
    companyId: parsed.data.companyId,
    to: parsed.data.email,
    subject: rendered.subject,
    body: rendered.body,
    sourceType: "notification_test",
    sourceId: parsed.data.type,
  });

  return NextResponse.json({ ok: true });
}
