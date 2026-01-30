import { queueEmail } from "@/lib/data/email-outbox";
import { dispatchEmailById } from "@/lib/email/dispatcher";

type QueueEmailParams = {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  sourceType?: string | null;
  sourceId?: string | null;
  meta?: Record<string, unknown>;
};

export async function queueEmailWithDispatch(params: QueueEmailParams) {
  const id = await queueEmail(params);
  const mode = process.env.EMAIL_SEND_MODE ?? "queue";
  if (mode === "immediate") {
    await dispatchEmailById(id);
  }
  return id;
}
