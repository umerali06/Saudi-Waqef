import { NextRequest, NextResponse } from "next/server";
import { createRegistrationRequest, listRecentRequests } from "@/lib/data/registration-requests";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import {
  ownerAccessRequestMail,
  platformRequestMail,
  registrationReceivedMail,
  roleLabel,
} from "@/lib/email/registration-mails";
import { createNotification } from "@/lib/data/notifications";
import { listUserIdsByCompanyRoles } from "@/lib/data/memberships";
import { getUserByEmail, getUserById } from "@/lib/data/users";
import { findActiveCompanyByName } from "@/lib/data/companies";
import { createSystemAlert } from "@/lib/data/system-alerts";
import { notifySystemAdmins } from "@/lib/notifications/system-admins";
import { registrationErrorFields, registrationSchema } from "@/lib/validators/registration";

const MAX_REQUESTS_PER_EMAIL = 3;
const MAX_REQUESTS_PER_IP = 10;

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
    const body = await req.json().catch(() => null);
    const parsed = registrationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", fields: registrationErrorFields(parsed.error) },
        { status: 400 }
      );
    }
    const { kind, name, email, companyName, locale } = parsed.data;
    // Opening a company always makes the applicant its owner.
    const requestedRole = parsed.data.kind === "new" ? "owner" : parsed.data.requestedRole;
    const phone = parsed.data.kind === "new" ? parsed.data.phone : null;
    const crNumber = parsed.data.kind === "new" ? parsed.data.crNumber : null;
    const vatNumber = parsed.data.kind === "new" ? parsed.data.vatNumber : null;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const recent = await listRecentRequests({ emailLower: email.toLowerCase(), ip });
    const duplicate = recent.pending.find(
      (entry) =>
        entry.kind === kind &&
        entry.companyName.trim().toLowerCase() === companyName.toLowerCase()
    );
    if (duplicate) {
      return NextResponse.json({ success: true, id: duplicate.id });
    }
    if (recent.emailCount >= MAX_REQUESTS_PER_EMAIL || recent.ipCount >= MAX_REQUESTS_PER_IP) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const company = kind === "join" ? await findActiveCompanyByName(companyName) : null;
    const id = await createRegistrationRequest({
      name,
      email,
      companyId: company?.id,
      companyName,
      phone: phone ?? undefined,
      requestedRole,
      kind,
      crNumber,
      vatNumber,
      locale,
      ip,
    });

    // The request is stored; a mail failure must not make the visitor submit it again.
    try {
      const baseUrl =
        normalizeBaseUrl(process.env.NEXTAUTH_URL) ||
        normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
        req.nextUrl.origin.replace(/\/+$/, "");
      const requestInfo = {
        kind,
        name,
        email,
        companyName,
        requestedRole,
        phone,
        crNumber,
        vatNumber,
      };
      const notification = {
        type: "registration_received" as const,
        data: { requestId: id },
      };
      const inApp = (language: "ar" | "en") =>
        language === "ar"
          ? {
              title: "طلب انضمام جديد",
              body: `${name}: ${companyName} (${roleLabel(requestedRole, "ar")})`,
            }
          : {
              title: "New access request",
              body: `${name}: ${companyName} (${roleLabel(requestedRole, "en")})`,
            };

      const [existingUser, ownerUserIds] = await Promise.all([
        getUserByEmail(email),
        company ? listUserIdsByCompanyRoles(company.id, ["owner"]) : Promise.resolve([]),
      ]);
      const owners = await Promise.all(ownerUserIds.map((userId) => getUserById(userId)));
      const companyLocale = company?.defaultLanguage ?? "ar";

      const received = registrationReceivedMail({
        locale,
        request: requestInfo,
        hasAccount: Boolean(existingUser),
        loginUrl: `${baseUrl}/login`,
        forgotUrl: `${baseUrl}/forgot-password`,
      });
      const platform = platformRequestMail({
        locale: "ar",
        request: requestInfo,
        linked: Boolean(company),
        reviewUrl: `${baseUrl}/admin/access-requests`,
      });

      await Promise.allSettled([
        queueEmailWithDispatch({
          companyId: "system",
          to: email,
          subject: received.subject,
          body: received.body,
          sourceType: "registration_received",
          sourceId: id,
        }),
        ...ownerUserIds.map((userId) =>
          createNotification({
            ...notification,
            ...inApp(companyLocale),
            userId,
            companyId: company?.id ?? null,
          })
        ),
        ...owners
          .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner?.email))
          .map((owner) => {
            const mail = ownerAccessRequestMail({
              locale: companyLocale,
              companyName: company?.name ?? companyName,
              request: requestInfo,
              reviewUrl: `${baseUrl}/admin/registrations`,
            });
            return queueEmailWithDispatch({
              companyId: "system",
              to: owner.email,
              subject: mail.subject,
              body: mail.body,
              sourceType: "registration_request",
              sourceId: id,
            });
          }),
        notifySystemAdmins({
          ...notification,
          ...inApp("ar"),
          subject: platform.subject,
          html: platform.body,
          sourceType: "registration_request",
          sourceId: id,
          data: { url: "/admin/access-requests", requestId: id },
        }),
        createSystemAlert({
          title: "طلب تسجيل جديد | New registration request",
          message: `${requestInfo.name} - ${requestInfo.email} - ${companyName}`,
          type: "registration_request",
          severity: "medium",
          source: "registration",
          entityId: id,
        }),
      ]);
    } catch (error) {
      console.error("Failed to notify access request recipients:", error);
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
