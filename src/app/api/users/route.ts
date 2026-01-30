import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { listMembershipsByCompany } from "@/lib/data/memberships";
import { getUserById } from "@/lib/data/users";
import { requireAdminAccess } from "@/lib/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberships = await listMembershipsByCompany(companyId);
  const users = await Promise.all(
    memberships.map(async (member) => {
      const userDoc = await getUserById(member.userId);
      return userDoc
        ? {
            id: userDoc.id,
            email: userDoc.email,
            name: userDoc.name,
            role: member.role,
            status: userDoc.status,
          }
        : null;
    })
  );

  return NextResponse.json({ users: users.filter(Boolean) });
}

