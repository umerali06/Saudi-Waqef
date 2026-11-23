import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequestById, updateRegistrationRequestStatus } from "@/lib/data/registration-requests";
import { createUser, getUserByEmail } from "@/lib/data/users";
import { createCompany, findActiveCompanyByName, getCompanyById } from "@/lib/data/companies";
import { seedCompanyDefaults } from "@/lib/data/company-seed";
import { createMembership, getMembership } from "@/lib/data/memberships";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { registrationApprovedMail } from "@/lib/email/registration-mails";
import { checkUserLimit } from "@/lib/billing/limits";
import { getSessionUser } from "@/lib/auth-helpers";
import { isSystemAdminUser } from "@/lib/data/system-admins";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import type { Role } from "@/lib/types";

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function mapRequestedRoleToMembershipRole(requestedRole: string): Role {
  const normalized = requestedRole.trim().toLowerCase();
  switch (normalized) {
    case "owner":
      return "owner";
    case "admin":
      return "admin";
    case "hr":
      return "hr";
    case "accountant":
      return "accountant";
    case "employee":
      return "employee";
    case "viewer":
      return "viewer";
    default:
      return "viewer";
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionUser = await getSessionUser({ ignoreImpersonation: true });
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const request = await getRegistrationRequestById(id);

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }

    const systemAdmin = await isSystemAdminUser(sessionUser.id, sessionUser.email ?? undefined);
    let selectedCompany = request.companyId
      ? await getCompanyById(request.companyId)
      : null;

    if (request.companyId) {
      if (!selectedCompany || selectedCompany.status !== "active") {
        return NextResponse.json({ error: "Company is not active" }, { status: 400 });
      }

      const approverMembership = await getMembership({
        userId: sessionUser.id,
        companyId: request.companyId,
      });
      if (approverMembership?.role !== "owner" && !systemAdmin) {
        return NextResponse.json({ error: "Only the company owner can approve this request" }, { status: 403 });
      }
    } else if (!systemAdmin) {
      return NextResponse.json({ error: "Only a system admin can approve unlinked requests" }, { status: 403 });
    } else if (request.kind === "join") {
      // Joining never creates a company; the name has to match one by now.
      selectedCompany = await findActiveCompanyByName(request.companyName);
      if (!selectedCompany) {
        return NextResponse.json({ error: "Company not found" }, { status: 409 });
      }
    }

    const existingUser = await getUserByEmail(request.email);
    if (existingUser && selectedCompany) {
      // Anyone can submit a request for any address, so approving one must never change
      // the role of somebody who already belongs to the company.
      const existingMembership = await getMembership({
        userId: existingUser.id,
        companyId: selectedCompany.id,
      });
      if (existingMembership) {
        return NextResponse.json({ error: "Already a member" }, { status: 409 });
      }
    }
    if (selectedCompany) {
      const limitCheck = await checkUserLimit(selectedCompany.id);
      if (!limitCheck.ok) {
        return NextResponse.json(
          { error: limitCheck.reason ?? "Plan user limit reached" },
          { status: 400 }
        );
      }
    }

    const userId = existingUser?.id ?? uuid();
    const companyId = selectedCompany?.id ?? uuid();
    const membershipId = uuid();
    const password = crypto.randomBytes(8).toString("hex");
    // The first member of a new company owns it; otherwise nobody could ever manage it.
    const requestedRole = mapRequestedRoleToMembershipRole(request.requestedRole);
    const membershipRole: Role = !selectedCompany
      ? "owner"
      : requestedRole === "owner"
      ? "viewer"
      : requestedRole;
    const baseUrl =
      normalizeBaseUrl(process.env.NEXTAUTH_URL) ||
      normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
      req.nextUrl.origin.replace(/\/+$/, "");
    const loginUrl = `${baseUrl}/login`;

    // 1. Create User (if it does not already exist)
    if (!existingUser) {
      await createUser({
        id: userId,
        email: request.email,
        name: request.name,
        password: password,
        status: "active",
      });
    }

    // 2. Create Company if request was not linked to an existing one
    if (!selectedCompany) {
      await createCompany({
        id: companyId,
        name: request.companyName,
        vatNumber: request.vatNumber,
        crNumber: request.crNumber,
        defaultLanguage: request.locale,
        status: "active",
      });
      await seedCompanyDefaults(companyId);
    }

    // 3. Create Membership
    await createMembership({
      id: membershipId,
      userId: userId,
      companyId: companyId,
      role: membershipRole,
    });

    // 4. Update Request Status
    await updateRegistrationRequestStatus(id, "approved");

    // 5. Queue + dispatch email without failing approval if email transport fails
    let emailQueued = false;
    let emailError: string | null = null;
    try {
      const mail = registrationApprovedMail({
        locale: request.locale ?? "ar",
        name: request.name,
        email: request.email,
        companyName: selectedCompany?.name ?? request.companyName,
        isNewCompany: !selectedCompany,
        role: membershipRole,
        password: existingUser ? null : password,
        loginUrl,
      });
      await queueEmailWithDispatch({
        companyId: "system",
        to: request.email,
        subject: mail.subject,
        body: mail.body,
        sourceType: "registration_approved",
        sourceId: id,
      });
      emailQueued = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Failed to send approval email";
      console.error("Failed to send approval email:", error);
    }

    return NextResponse.json({ success: true, emailQueued, emailError, loginUrl });
  } catch (error) {
    console.error("Approval error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
