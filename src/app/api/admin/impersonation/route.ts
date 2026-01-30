import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getActiveImpersonation } from "@/lib/data/impersonations";
import { getUserById } from "@/lib/data/users";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const impersonationId = cookieStore.get("impersonation_id")?.value;
  if (!impersonationId) {
    return NextResponse.json({ active: false });
  }

  const impersonation = await getActiveImpersonation(impersonationId);
  if (!impersonation) {
    const response = NextResponse.json({ active: false });
    response.cookies.set("impersonation_id", "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  const targetUser = await getUserById(impersonation.targetUserId);

  return NextResponse.json({
    active: true,
    impersonation: {
      id: impersonation.id,
      adminEmail: impersonation.adminEmail ?? null,
      targetUserId: impersonation.targetUserId,
      targetEmail: impersonation.targetEmail ?? null,
      targetName: targetUser?.name ?? null,
      companyId: impersonation.companyId ?? null,
    },
  });
}
