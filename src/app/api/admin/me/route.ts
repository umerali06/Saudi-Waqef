import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { isSystemAdminUser } from "@/lib/data/system-admins";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser({ ignoreImpersonation: true });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isSystemAdmin = await isSystemAdminUser(user.id, user.email ?? undefined);
  return NextResponse.json({
    isSystemAdmin,
  });
}
