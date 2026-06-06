import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequestById, updateRegistrationRequestStatus } from "@/lib/data/registration-requests";
import { createUser, getUserByEmail } from "@/lib/data/users";
import { createCompany, getCompanyById } from "@/lib/data/companies";
import { createMembership, getMembership, updateMembershipRole } from "@/lib/data/memberships";
import { queueEmailWithDispatch } from "@/lib/email/queue";
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
    const selectedCompany = request.companyId
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
      if (approverMembership?.role !== "owner") {
        return NextResponse.json({ error: "Only the company owner can approve this request" }, { status: 403 });
      }
    } else if (!systemAdmin) {
      return NextResponse.json({ error: "Only a system admin can approve unlinked requests" }, { status: 403 });
    }

    const existingUser = await getUserByEmail(request.email);
    const userId = existingUser?.id ?? uuid();
    const companyId = selectedCompany?.id ?? uuid();
    const membershipId = uuid();
    const password = crypto.randomBytes(8).toString("hex");
    const membershipRole = mapRequestedRoleToMembershipRole(request.requestedRole);
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
        status: "active",
      });
    }

    // 3. Create or update Membership with requested role
    const existingMembership = await getMembership({
      userId,
      companyId,
    });
    if (existingMembership) {
      if (existingMembership.role !== membershipRole) {
        await updateMembershipRole(existingMembership.id, membershipRole);
      }
    } else {
      await createMembership({
        id: membershipId,
        userId: userId,
        companyId: companyId,
        role: membershipRole,
      });
    }

    // 4. Update Request Status
    await updateRegistrationRequestStatus(id, "approved");

    // 5. Queue + dispatch email without failing approval if email transport fails
    let emailQueued = false;
    let emailError: string | null = null;
    try {
      const body = existingUser
        ? `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Registration Approved</h2>
          <p>Dear ${request.name},</p>
          <p>Your registration request for <strong>${request.companyName}</strong> has been approved.</p>
          <p>Your account already exists. You can log in here:</p>
          <p><a href="${loginUrl}">Click here to login</a></p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `
        : `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Registration Approved</h2>
          <p>Dear ${request.name},</p>
          <p>Your registration request for <strong>${request.companyName}</strong> has been approved.</p>
          <p>You can now log in to your account using the following credentials:</p>
          <ul>
            <li><strong>Email:</strong> ${request.email}</li>
            <li><strong>Temporary Password:</strong> ${password}</li>
          </ul>
          <p>Please change your password after logging in.</p>
          <p><a href="${loginUrl}">Click here to login</a></p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `;

      await queueEmailWithDispatch({
        companyId: "system",
        to: request.email,
        subject: "Registration Approved - Saudi Waqef",
        body,
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
