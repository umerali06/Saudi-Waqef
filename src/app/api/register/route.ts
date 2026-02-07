import { NextRequest, NextResponse } from "next/server";
import { createRegistrationRequest } from "@/lib/data/registration-requests";
import { sendEmail } from "@/lib/email/sender";
import { listSystemAdmins } from "@/lib/data/system-admins";
import { createNotification } from "@/lib/data/notifications";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, companyName, phone, requestedRole } = body;

    if (!name || !email || !companyName || !requestedRole) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = await createRegistrationRequest({
      name,
      email,
      companyName,
      phone,
      requestedRole,
    });

    // Send acknowledgement email
    await sendEmail({
      to: email,
      subject: "Registration Request Received - Saudi Waqef",
      body: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Request Received</h2>
          <p>Dear ${name},</p>
          <p>Thank you for your interest in Saudi Waqef. We have received your request for a <strong>${requestedRole}</strong> account for <strong>${companyName}</strong>.</p>
          <p>Our team will review your details and you will receive another email with your login credentials once approved.</p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `,
    });

    // Notify Admins
    try {
      const admins = await listSystemAdmins();
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin.userId,
            companyId: null,
            type: "registration_received",
            title: "New Registration Request",
            body: `New request from ${companyName} (${name})`,
            data: { requestId: id },
          })
        )
      );
    } catch (error) {
      console.error("Failed to notify admins:", error);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
