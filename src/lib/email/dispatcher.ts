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
    return "failed" as const;
  }
}

export async function dispatchQueuedEmails(params?: {
  limit?: number;
  retryFailed?: boolean;
  maxAttempts?: number;
}) {
  const limit = params?.limit ?? 25;
  const maxAttempts = params?.maxAttempts ?? 5;

  const queued = await listOutboxEmails({
    status: "queued",
    limit,
    maxAttempts,
  });

  let failed: OutboxEmail[] = [];
  if (params?.retryFailed) {
    failed = await listOutboxEmails({
      status: "failed",
      limit,
      maxAttempts,
    });
  }

  const items = [...queued, ...failed].slice(0, limit);

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
