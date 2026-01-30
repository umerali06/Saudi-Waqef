import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth-helpers";
import { createCompany, listCompaniesForUser } from "@/lib/data/companies";
import { createMembership } from "@/lib/data/memberships";
import { createCompanySchema } from "@/lib/validators/auth";
import { checkCompanyLimit } from "@/lib/billing/limits";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companies = await listCompaniesForUser(user.id);
  return NextResponse.json({ companies });
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

  const limitCheck = await checkCompanyLimit(user.id);
  if (!limitCheck.ok) {
    return NextResponse.json(
      { error: limitCheck.reason ?? "Plan company limit reached" },
      { status: 400 }
    );
  }

  const companyId = uuidv4();
  const membershipId = uuidv4();

  await createCompany({ id: companyId, name: parsed.data.name });
  await createMembership({
    id: membershipId,
    userId: user.id,
    companyId,
    role: "owner",
  });

  return NextResponse.json({ companyId });
}
