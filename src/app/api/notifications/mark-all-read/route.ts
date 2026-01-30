import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { markAllNotificationsRead } from "@/lib/data/notifications";
import { requireCompanyMembership } from "@/lib/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const companyId = body?.companyId ?? null;

  if (companyId) {
    const membership = await requireCompanyMembership(user.id, companyId);
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  await markAllNotificationsRead({ userId: user.id, companyId });
  return NextResponse.json({ ok: true });
}
