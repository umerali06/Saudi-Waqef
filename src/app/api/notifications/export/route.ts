import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listNotifications } from "@/lib/data/notifications";
import { requireCompanyMembership } from "@/lib/access";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const status = (searchParams.get("status") ?? "all") as "read" | "unread" | "all";

  if (companyId) {
    const membership = await requireCompanyMembership(user.id, companyId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const notifications = await listNotifications({
    userId: user.id,
    companyId: companyId ?? null,
    status,
  });

  const headers = ["ID", "Type", "Title", "Body", "Status", "Created At", "Read At"];
  const rows = notifications.map((notification) => [
    notification.id,
    notification.type,
    notification.title,
    notification.body,
    notification.status,
    notification.createdAt.toISOString(),
    notification.readAt ? notification.readAt.toISOString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=notifications.csv",
    },
  });
}
