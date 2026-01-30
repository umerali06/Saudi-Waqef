import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listNotifications } from "@/lib/data/notifications";
import { requireCompanyMembership } from "@/lib/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId") ?? undefined;
  const status = searchParams.get("status") as "read" | "unread" | "all" | null;

  if (companyId) {
    const membership = await requireCompanyMembership(user.id, companyId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const notifications = await listNotifications({
    userId: user.id,
    companyId: companyId ?? null,
    status: status ?? "all",
  });

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      ...notification,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
    })),
  });
}
