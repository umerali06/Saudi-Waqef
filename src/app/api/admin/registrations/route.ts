import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getRegistrationRequests } from "@/lib/data/registration-requests";
import { isSystemAdminUser } from "@/lib/data/system-admins";
import { listMembershipsByUser } from "@/lib/data/memberships";
import { listActiveCompanies } from "@/lib/data/companies";

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser({ ignoreImpersonation: true });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const systemAdmin = await isSystemAdminUser(user.id, user.email ?? undefined);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    const companyId = searchParams.get("companyId");

    const memberships = await listMembershipsByUser(user.id);
    const ownedCompanyIds = memberships
      .filter((membership) => membership.role === "owner")
      .map((membership) => membership.companyId);

    // Inside a company only its own requests are shown, even to a platform admin.
    const isPlatformView = systemAdmin && !companyId;
    if (
      !isPlatformView &&
      (companyId
        ? !systemAdmin && !ownedCompanyIds.includes(companyId)
        : ownedCompanyIds.length === 0)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const requests = await getRegistrationRequests(status || undefined);
    if (isPlatformView) {
      const companies = await listActiveCompanies();
      const names = new Set(companies.map((company) => company.name.trim().toLowerCase()));
      return NextResponse.json({
        requests: requests.map((request) => ({
          ...request,
          nameExists: !request.companyId && names.has(request.companyName.trim().toLowerCase()),
        })),
      });
    }

    const visibleCompanyIds = companyId ? [companyId] : ownedCompanyIds;
    return NextResponse.json({
      requests: requests.filter(
        (request) => request.companyId && visibleCompanyIds.includes(request.companyId)
      ),
    });
  } catch (error) {
    console.error("Failed to fetch registration requests:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
