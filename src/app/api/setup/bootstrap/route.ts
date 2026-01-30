import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { bootstrapSchema } from "@/lib/validators/auth";
import { hasAnyUsers, createUser } from "@/lib/data/users";
import { createCompany } from "@/lib/data/companies";
import { createMembership } from "@/lib/data/memberships";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const hasUsers = await hasAnyUsers();
  if (hasUsers) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = bootstrapSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid setup payload" },
      { status: 400 }
    );
  }

  const companyId = uuidv4();
  const userId = uuidv4();
  const membershipId = uuidv4();

  await createCompany({ id: companyId, name: parsed.data.companyName });
  await createUser({
    id: userId,
    email: parsed.data.email,
    name: parsed.data.adminName,
    password: parsed.data.password,
    status: "active",
  });
  await createMembership({
    id: membershipId,
    userId,
    companyId,
    role: "owner",
  });

  return NextResponse.json({ companyId, userId });
}
