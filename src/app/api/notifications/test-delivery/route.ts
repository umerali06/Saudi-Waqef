import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { createNotification } from "@/lib/data/notifications";

export const runtime = "nodejs";

/** Sends the signed-in person a real notification through every in-app channel. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await createNotification({
    userId: user.id,
    companyId: null,
    type: "platform_event",
    title: "اختبار الإشعارات | Notification test",
    body: "تعمل الإشعارات على هذا الجهاز. | Notifications work on this device.",
    data: { url: "/notifications" },
  });
  return NextResponse.json({ ok: true });
}
