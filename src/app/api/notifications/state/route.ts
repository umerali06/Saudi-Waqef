import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getNotificationVersion } from "@/lib/data/notifications";

export const runtime = "nodejs";

/** One document read: tells an open page whether anything changed, so it can poll often. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ version: await getNotificationVersion(user.id) });
}
