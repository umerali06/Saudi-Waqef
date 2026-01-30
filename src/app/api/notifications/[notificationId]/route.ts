import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getNotificationById, markNotificationRead } from "@/lib/data/notifications";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function PATCH(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;
  const notification = await getNotificationById(notificationId);
  if (!notification || notification.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await markNotificationRead(notificationId);
  return NextResponse.json({ ok: true });
}
