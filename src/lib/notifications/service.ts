import type { Locale } from "@/i18n/messages";
import { getCompanyById } from "@/lib/data/companies";
import { createNotification } from "@/lib/data/notifications";
import {
  getNotificationPreferences,
  resolveChannelPreferences,
} from "@/lib/data/notification-preferences";
import { listMembershipsByCompany } from "@/lib/data/memberships";
import { getUserById } from "@/lib/data/users";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import type { NotificationType } from "@/lib/notifications/types";
import { renderTemplate } from "@/lib/notifications/templates";

export async function notifyCompanyRoles(params: {
  companyId: string;
  roles: Array<"owner" | "admin" | "accountant" | "hr" | "employee" | "viewer">;
  type: NotificationType;
  data?: Record<string, string>;
  actorId?: string | null;
}) {
  const memberships = await listMembershipsByCompany(params.companyId);
  const targetMemberships = memberships.filter((member) =>
    params.roles.includes(member.role)
  );

  for (const membership of targetMemberships) {
    if (params.actorId && membership.userId === params.actorId) {
      continue;
    }
    await notifyUser({
      userId: membership.userId,
      companyId: params.companyId,
      type: params.type,
      data: params.data,
    });
  }
}

export async function notifyUser(params: {
  userId: string;
  companyId: string;
  type: NotificationType;
  data?: Record<string, string>;
}) {
  const [user, company, prefs] = await Promise.all([
    getUserById(params.userId),
    getCompanyById(params.companyId),
    getNotificationPreferences({
      userId: params.userId,
      companyId: params.companyId,
    }),
  ]);

  const locale: Locale = company?.defaultLanguage ?? "ar";
  const template = renderTemplate(params.type, locale, {
    companyName: company?.name ?? "",
    ...params.data,
  });

  const channels = resolveChannelPreferences(prefs, params.type);

  if (channels.inApp) {
    await createNotification({
      companyId: params.companyId,
      userId: params.userId,
      type: params.type,
      title: template.title,
      body: template.body,
      data: params.data ?? {},
    });
  }

  if (channels.email && user?.email) {
    await queueEmailWithDispatch({
      companyId: params.companyId,
      to: user.email,
      subject: template.subject,
      body: template.body,
      sourceType: "notification",
      sourceId: params.type,
      meta: {
        notificationType: params.type,
        userId: params.userId,
        companyId: params.companyId,
      },
    });
  }
}
