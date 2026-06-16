import { NextRequest, NextResponse } from "next/server";
import { createRegistrationRequest } from "@/lib/data/registration-requests";
import { sendEmail } from "@/lib/email/sender";
import { listSystemAdmins } from "@/lib/data/system-admins";
import { createNotification } from "@/lib/data/notifications";
import { listUserIdsByCompanyRoles } from "@/lib/data/memberships";
import { getUserById } from "@/lib/data/users";
import { findActiveCompanyByName } from "@/lib/data/companies";

const ALLOWED_REQUEST_ROLES = new Set(["admin", "accountant", "hr", "employee", "viewer"]);

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, companyName, phone, requestedRole } = body;

    if (!name || !email || !companyName || !requestedRole) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const normalizedRequestedRole = String(requestedRole).trim().toLowerCase();
    if (!ALLOWED_REQUEST_ROLES.has(normalizedRequestedRole)) {
      return NextResponse.json({ error: "Invalid requested role" }, { status: 400 });
    }

    const normalizedCompanyName = String(companyName).trim();
    if (normalizedCompanyName.length < 2) {
      return NextResponse.json({ error: "Invalid company name" }, { status: 400 });
    }

    const company = await findActiveCompanyByName(normalizedCompanyName);

    const id = await createRegistrationRequest({
      name,
      email,
      companyId: company?.id,
      companyName: normalizedCompanyName,
      phone,
      requestedRole: normalizedRequestedRole,
    });
    const baseUrl =
      normalizeBaseUrl(process.env.NEXTAUTH_URL) ||
      normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
      req.nextUrl.origin.replace(/\/+$/, "");
    const reviewUrl = `${baseUrl}/admin/registrations`;

    // Send acknowledgement email
    await sendEmail({
      to: email,
      subject: "Registration Request Received - Saudi Waqef",
      body: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Request Received</h2>
          <p>Dear ${name},</p>
          <p>We have received your request for <strong>${normalizedRequestedRole}</strong> access to <strong>${normalizedCompanyName}</strong>.</p>
          <p>An administrator will review your request. You will receive another email once it is approved or rejected.</p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `,
    });

    // Notify company owners and system admins.
    try {
      const [admins, ownerUserIds] = await Promise.all([
        listSystemAdmins(),
        company ? listUserIdsByCompanyRoles(company.id, ["owner"]) : Promise.resolve([]),
      ]);
      const recipientUserIds = Array.from(
        new Set([
          ...ownerUserIds,
          ...admins.map((admin) => admin.userId).filter(Boolean),
        ])
      );

      await Promise.all(
        recipientUserIds.map((userId) =>
          createNotification({
            userId,
            companyId: company?.id ?? null,
            type: "registration_received",
            title: "New Access Request",
            body: `${name} requested ${normalizedRequestedRole} access to ${normalizedCompanyName}`,
            data: { requestId: id },
          })
        )
      );

      const ownerUsers = await Promise.all(ownerUserIds.map((userId) => getUserById(userId)));
      await Promise.all(
        ownerUsers
          .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner?.email))
          .map((owner) =>
            sendEmail({
              to: owner.email,
              subject: `Access Request for ${normalizedCompanyName} - Saudi Waqef`,
              body: `
                <div style="font-family: sans-serif; padding: 20px;">
                  <h2>New Access Request</h2>
                  <p>Dear ${owner.name},</p>
                  <p>${name} (${email}) requested <strong>${normalizedRequestedRole}</strong> access to <strong>${normalizedCompanyName}</strong>.</p>
                  ${phone ? `<p>Phone: ${phone}</p>` : ""}
                  <p>Only a company owner can approve this request.</p>
                  <p><a href="${reviewUrl}">Review request</a></p>
                  <br/>
                  <p>Best regards,</p>
                  <p>The Saudi Waqef Team</p>
                </div>
              `,
            })
          )
      );
    } catch (error) {
      console.error("Failed to notify access request recipients:", error);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
