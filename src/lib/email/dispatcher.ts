import { buildEmailAttachments } from "@/lib/email/documents";
import { sendEmail } from "@/lib/email/sender";
import {
  getOutboxEmail,
  listOutboxEmails,
  updateOutboxStatus,
  type OutboxEmail,
} from "@/lib/data/email-outbox";

type DispatchResult = {
  processed: number;
  sent: number;
  failed: number;
};

async function dispatchOne(email: OutboxEmail) {
  const attempts = (email.attempts ?? 0) + 1;
  await updateOutboxStatus({
    id: email.id,
    status: "sending",
    attempts,
    lastError: null,
  });

  try {
    await sendEmail({
      to: email.to,
      subject: email.subject,
      body: email.body,
      fromName: typeof email.meta?.fromName === "string" ? email.meta.fromName : null,
      replyTo: typeof email.meta?.replyTo === "string" ? email.meta.replyTo : null,
      attachments: await buildEmailAttachments(email),
    });
    await updateOutboxStatus({ id: email.id, status: "sent", attempts });
    return "sent" as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send email";
    await updateOutboxStatus({
      id: email.id,
      status: "failed",
      attempts,
      lastError: message,
    });
    if (email.sourceType !== "platform_event") {
      // Loaded on demand: reporting sends mail itself, so a static import would be circular.
      const { reportPlatformEvent } = await import("@/lib/notifications/platform-events");
      await reportPlatformEvent({
        kind: "email_failed",
        severity: "high",
        title: { ar: "تعذر إرسال بريد", en: "Email could not be sent" },
        message: {
          ar: `لم تصل رسالة إلى ${email.to}: ${message}`,
          en: `A message to ${email.to} was not delivered: ${message}`,
        },
        details: [[{ ar: "الموضوع", en: "Subject" }, email.subject]],
        path: "/admin/alerts",
        entityId: email.companyId,
        quietMinutes: 60,
      });
    }
    return "failed" as const;
  }
}

export async function dispatchQueuedEmails(params?: {
  limit?: number;
  retryFailed?: boolean;
  maxAttempts?: number;
  companyId?: string;
}) {
  const limit = params?.limit ?? 25;
  const maxAttempts = params?.maxAttempts ?? 5;

  // Read past the limit so one company, or mail that keeps failing, cannot block the rest.
  const readLimit = Math.max(limit, 500);
  const queued = await listOutboxEmails({
    status: "queued",
    limit: readLimit,
    maxAttempts,
  });

  let failed: OutboxEmail[] = [];
  if (params?.retryFailed) {
    failed = await listOutboxEmails({
      status: "failed",
      limit: readLimit,
      maxAttempts,
    });
  }

  const items = [...queued, ...failed]
    .filter((email) => !params?.companyId || email.companyId === params.companyId)
    .slice(0, limit);

  const result: DispatchResult = { processed: 0, sent: 0, failed: 0 };
  for (const email of items) {
    result.processed += 1;
    const outcome = await dispatchOne(email);
    if (outcome === "sent") {
      result.sent += 1;
    } else {
      result.failed += 1;
    }
  }

  return result;
}

export async function dispatchEmailById(id: string) {
  const email = await getOutboxEmail(id);
  if (!email) {
    return { processed: 0, sent: 0, failed: 0 } as DispatchResult;
  }
  const outcome = await dispatchOne(email);
  return {
    processed: 1,
    sent: outcome === "sent" ? 1 : 0,
    failed: outcome === "failed" ? 1 : 0,
  } as DispatchResult;
}
