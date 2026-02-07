import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequestById, updateRegistrationRequestStatus } from "@/lib/data/registration-requests";
import { createUser } from "@/lib/data/users";
import { createCompany } from "@/lib/data/companies";
import { createMembership } from "@/lib/data/memberships";
import { sendEmail } from "@/lib/email/sender";
import { v4 as uuid } from "uuid";
import crypto from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const request = await getRegistrationRequestById(id);

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "pending") {
      return NextResponse.json({ error: "Request is not pending" }, { status: 400 });
    }

    // Generate IDs
    const userId = uuid();
    const companyId = uuid();
    const membershipId = uuid();
    const password = crypto.randomBytes(8).toString("hex");

    // 1. Create User
    await createUser({
      id: userId,
      email: request.email,
      name: request.name,
      password: password,
      status: "active",
    });

    // 2. Create Company
    await createCompany({
      id: companyId,
      name: request.companyName,
      status: "active",
      // Default currency/timezone can be updated later by user
    });

    // 3. Create Membership
    await createMembership({
      id: membershipId,
      userId: userId,
      companyId: companyId,
      role: "owner", // The person registering is the owner
    });

    // 4. Update Request Status
    await updateRegistrationRequestStatus(id, "approved");

    // 5. Send Email
    await sendEmail({
      to: request.email,
      subject: "Registration Approved - Saudi Waqef",
      body: `
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
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/login">Click here to login</a></p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approval error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
