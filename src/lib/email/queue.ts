import { getOutboxEmail, queueEmail } from "@/lib/data/email-outbox";
import { dispatchEmailById } from "@/lib/email/dispatcher";
import { DOCUMENT_SOURCES } from "@/lib/email/documents";

type QueueEmailParams = {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  sourceType?: string | null;
  sourceId?: string | null;
  meta?: Record<string, unknown>;
};

// Mail the recipient is waiting for; it must not sit in the outbox until the next cron run.
const TRANSACTIONAL_SOURCES = new Set([
  "password_reset",
  "invite",
  "registration_received",
  "registration_request",
  "registration_approved",
  "registration_rejected",
  "support_ticket",
  "platform_event",
]);

export async function queueEmailWithDispatch(params: QueueEmailParams) {
  const id = await queueEmail(params);
  const mode = process.env.EMAIL_SEND_MODE ?? "queue";
  if (mode === "immediate" || TRANSACTIONAL_SOURCES.has(params.sourceType ?? "") || DOCUMENT_SOURCES.has(params.sourceType ?? "")) {
    await dispatchEmailById(id);
  }
  return id;
}

/** Queues and sends at once; reports whether the mail server took the message. */
export async function sendDocumentEmail(params: QueueEmailParams) {
  const id = await queueEmailWithDispatch(params);
  const email = await getOutboxEmail(id);
  return email?.status === "sent"
    ? { ok: true as const, id }
    : { ok: false as const, id, error: email?.lastError ?? "Email was not sent" };
}
