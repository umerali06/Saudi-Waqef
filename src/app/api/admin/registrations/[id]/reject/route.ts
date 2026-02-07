import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequestById, updateRegistrationRequestStatus } from "@/lib/data/registration-requests";
import { sendEmail } from "@/lib/email/sender";

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

    // Update Request Status
    await updateRegistrationRequestStatus(id, "rejected");

    // Send Email
    await sendEmail({
      to: request.email,
      subject: "Registration Update - Saudi Waqef",
      body: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Registration Update</h2>
          <p>Dear ${request.name},</p>
          <p>Thank you for your interest in Saudi Waqef.</p>
          <p>After reviewing your request for <strong>${request.companyName}</strong>, we regret to inform you that we are unable to approve your registration at this time.</p>
          <br/>
          <p>Best regards,</p>
          <p>The Saudi Waqef Team</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Rejection error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
