import { NextResponse } from "next/server";
import type { Locale } from "@/i18n/messages";
import { getSessionUser } from "@/lib/auth-helpers";
import { renderTemplate } from "@/lib/notifications/templates";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as NotificationType | null;
  const locale = (searchParams.get("locale") as Locale | null) ?? "ar";

  if (!type || !NOTIFICATION_TYPES.includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const data: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== "type" && key !== "locale") {
      data[key] = value;
    }
  });

  const rendered = renderTemplate(type, locale, data);
  return NextResponse.json({
    type,
    locale,
    rendered,
  });
}
