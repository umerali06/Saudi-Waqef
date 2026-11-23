import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequestById, updateRegistrationRequestStatus } from "@/lib/data/registration-requests";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { registrationRejectedMail } from "@/lib/email/registration-mails";
import { getSessionUser } from "@/lib/auth-helpers";
import { getCompanyById } from "@/lib/data/companies";
import { getMembership } from "@/lib/data/memberships";
import { isSystemAdminUser } from "@/lib/data/system-admins";

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
    if (request.companyId) {
      const company = await getCompanyById(request.companyId);
      if (!company || company.status !== "active") {
        return NextResponse.json({ error: "Company is not active" }, { status: 400 });
      }

      const membership = await getMembership({
        userId: sessionUser.id,
        companyId: request.companyId,
      });
      if (membership?.role !== "owner" && !systemAdmin) {
        return NextResponse.json({ error: "Only the company owner can reject this request" }, { status: 403 });
      }
    } else if (!systemAdmin) {
      return NextResponse.json({ error: "Only a system admin can reject unlinked requests" }, { status: 403 });
    }

    // Update Request Status
    await updateRegistrationRequestStatus(id, "rejected");

    // Send Email
    const baseUrl = (process.env.NEXTAUTH_URL?.trim() || req.nextUrl.origin).replace(/\/+$/, "");
    const mail = registrationRejectedMail({
      locale: request.locale ?? "ar",
      kind: request.kind ?? (request.companyId ? "join" : "new"),
      name: request.name,
      companyName: request.companyName,
      registerUrl: `${baseUrl}/register`,
    });
    await queueEmailWithDispatch({
      companyId: "system",
      to: request.email,
      subject: mail.subject,
      body: mail.body,
      sourceType: "registration_rejected",
      sourceId: id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Rejection error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
