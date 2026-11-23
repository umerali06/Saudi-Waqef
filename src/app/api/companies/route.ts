import { NextResponse } from "next/server";
import { reportPlatformEvent } from "@/lib/notifications/platform-events";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth-helpers";
import { createCompany, listCompaniesForUser } from "@/lib/data/companies";
import { createMembership, listMembershipsByCompany } from "@/lib/data/memberships";
import { createCompanySchema } from "@/lib/validators/auth";
import { checkCompanyLimit, getCompanyUsage } from "@/lib/billing/limits";
import { cleanCompanyName, isValidCompanyName } from "@/lib/validators/registration";
import { seedCompanyDefaults } from "@/lib/data/company-seed";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [companies, usage] = await Promise.all([
    listCompaniesForUser(user.id),
    getCompanyUsage(user.id),
  ]);
  const rows = await Promise.all(
    companies.map(async (company) => {
      const ownerCount = (await listMembershipsByCompany(company.id)).filter(
        (membership) => membership.role === "owner"
      ).length;
      return { ...company, ownerCount, canLeave: company.role !== "owner" || ownerCount > 1 };
    })
  );
  return NextResponse.json({ userId: user.id, companies: rows, usage });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid company payload" },
      { status: 400 }
    );
  }

  const name = cleanCompanyName(parsed.data.name);
  if (!isValidCompanyName(name)) {
    return NextResponse.json({ error: "Invalid company payload" }, { status: 400 });
  }

  const limitCheck = await checkCompanyLimit(user.id);
  if (!limitCheck.ok) {
    return NextResponse.json(
      { error: limitCheck.reason ?? "Plan company limit reached" },
      { status: 400 }
    );
  }

  const companyId = uuidv4();
  const membershipId = uuidv4();

  await createCompany({ id: companyId, name });
  await createMembership({
    id: membershipId,
    userId: user.id,
    companyId,
    role: "owner",
  });
  await seedCompanyDefaults(companyId);

  await reportPlatformEvent({
    kind: "company_created",
    severity: "low",
    title: { ar: "شركة جديدة على المنصة", en: "New company on the platform" },
    message: {
      ar: `أنشأ ${user.name ?? user.email ?? ""} الشركة: ${parsed.data.name}`,
      en: `${user.name ?? user.email ?? ""} created the company: ${parsed.data.name}`,
    },
    details: [
      [{ ar: "الشركة", en: "Company" }, parsed.data.name],
      [{ ar: "المالك", en: "Owner" }, user.email ?? ""],
    ],
    path: "/admin/tenants",
    entityId: companyId,
    companyId,
  });

  return NextResponse.json({ companyId });
}
