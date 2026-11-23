import { createNotification } from "@/lib/data/notifications";
import { getSystemAdminEmails, listSystemAdmins } from "@/lib/data/system-admins";
import { getUserByEmail } from "@/lib/data/users";
import { queueEmailWithDispatch } from "@/lib/email/queue";
import { logger } from "@/lib/ops/logger";
import type { NotificationType } from "@/lib/notifications/types";

/**
 * Alerts the platform team in the app and by email. Addresses in SYSTEM_ADMIN_EMAILS are
 * included even before those people have opened the admin console for the first time.
 */
export async function notifySystemAdmins(params: {
  type: NotificationType;
  title: string;
  body: string;
  subject: string;
  html: string;
  sourceType: string;
  sourceId: string;
  companyId?: string | null;
  data?: Record<string, unknown>;
}) {
  const admins = await listSystemAdmins();
  const emails = new Map<string, string | null>();
  const userIds = new Set<string>();
  admins.forEach((admin) => {
    userIds.add(admin.userId);
    if (admin.email) {
      emails.set(admin.email.trim().toLowerCase(), admin.userId);
    }
  });
  for (const email of getSystemAdminEmails()) {
    if (!emails.has(email)) {
      const user = await getUserByEmail(email);
      emails.set(email, user?.id ?? null);
      if (user) {
        userIds.add(user.id);
      }
    }
  }

  if (emails.size === 0) {
    // Nobody has been appointed yet. The platform's own mailbox still hears about it.
    const mailbox = process.env.EMAIL_FROM_ADDRESS?.trim().toLowerCase();
    if (mailbox) {
      emails.set(mailbox, null);
    }
    logger.warn("No platform administrator is configured (SYSTEM_ADMIN_EMAILS).", {
      sourceType: params.sourceType,
    });
  }

  await Promise.allSettled([
    ...Array.from(userIds).map((userId) =>
      createNotification({
        userId,
        companyId: params.companyId ?? null,
        type: params.type,
        title: params.title,
        body: params.body,
        data: params.data,
      })
    ),
    ...Array.from(emails.keys()).map((to) =>
      queueEmailWithDispatch({
        companyId: "system",
        to,
        subject: params.subject,
        body: params.html,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      })
    ),
  ]);
}
