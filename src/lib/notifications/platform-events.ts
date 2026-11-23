import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import { createSystemAlert, type SystemAlertSeverity } from "@/lib/data/system-alerts";
import { renderBilingualEmail } from "@/lib/email/template";
import { notifySystemAdmins } from "@/lib/notifications/system-admins";
import { logger } from "@/lib/ops/logger";

type Text = { ar: string; en: string };

/**
 * Everything the platform administrator must not miss. Each event is tracked in
 * the admin alerts log, shown in the app, pushed to the administrator's devices
 * and emailed. Never throws: reporting a problem must not become one.
 */
export async function reportPlatformEvent(params: {
  kind: string;
  severity: SystemAlertSeverity;
  title: Text;
  message: Text;
  /** Extra facts for the email and the log. */
  details?: Array<[Text, string]>;
  /** Page in this site where the administrator acts on it. */
  path: string;
  entityId?: string | null;
  companyId?: string | null;
  /** Repeats of the same kind and entity inside this window are only logged once. */
  quietMinutes?: number;
}) {
  try {
    if (params.quietMinutes && !(await claimWindow(params.kind, params.entityId ?? "", params.quietMinutes))) {
      return;
    }
    const alertId = await createSystemAlert({
      title: `${params.title.ar} | ${params.title.en}`,
      message: `${params.message.ar}\n${params.message.en}`,
      type: params.kind,
      severity: params.severity,
      source: params.companyId ?? "platform",
      entityId: params.entityId ?? null,
      metadata: Object.fromEntries((params.details ?? []).map(([label, value]) => [label.en, value])),
    });
    const baseUrl = (process.env.NEXTAUTH_URL?.trim() || "https://saudi-waqef.vercel.app").replace(/\/+$/, "");
    const url = `${baseUrl}${params.path}`;
    await notifySystemAdmins({
      type: "platform_event",
      title: `${params.title.ar} | ${params.title.en}`,
      body: params.message.ar,
      subject: `${params.severity === "critical" ? "[!] " : ""}${params.title.ar} | ${params.title.en}`,
      html: renderBilingualEmail({
        first: "ar",
        ar: {
          heading: params.title.ar,
          paragraphs: [params.message.ar],
          details: params.details?.map(([label, value]) => [label.ar, value]),
          action: { label: "فتح في لوحة الإدارة", url },
        },
        en: {
          heading: params.title.en,
          paragraphs: [params.message.en],
          details: params.details?.map(([label, value]) => [label.en, value]),
          action: { label: "Open in the admin console", url },
        },
      }),
      sourceType: "platform_event",
      sourceId: alertId,
      companyId: null,
      data: { url: params.path, alertId, kind: params.kind },
    });
  } catch (error) {
    logger.error("Platform event could not be reported", {
      kind: params.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function claimWindow(kind: string, entityId: string, minutes: number) {
  const id = crypto.createHash("sha256").update(`${kind}:${entityId}`).digest("hex");
  const ref = db.collection("platform_event_windows").doc(id);
  return db.runTransaction(async (tx) => {
    const until = (await tx.get(ref)).data()?.until?.toMillis?.() ?? 0;
    if (until > Date.now()) return false;
    tx.set(ref, { kind, entityId, until: Timestamp.fromMillis(Date.now() + minutes * 60_000) });
    return true;
  });
}
