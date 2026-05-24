import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getRegistrationRequests } from "@/lib/data/registration-requests";
import { isSystemAdminUser } from "@/lib/data/system-admins";
import { listMembershipsByUser } from "@/lib/data/memberships";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser({ ignoreImpersonation: true });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const systemAdmin = await isSystemAdminUser(user.id, user.email ?? undefined);
    if (!systemAdmin) {
      const memberships = await listMembershipsByUser(user.id);
      const canAccess = memberships.some(
        (membership) => membership.role === "owner" || membership.role === "admin"
      );
      if (!canAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    
    const requests = await getRegistrationRequests(status || undefined);
    
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Failed to fetch registration requests:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
