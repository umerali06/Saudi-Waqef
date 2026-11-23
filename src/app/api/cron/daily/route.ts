import { NextResponse } from "next/server";
import { GET as runRecurringInvoices } from "@/app/api/cron/recurring-invoices/route";
import { GET as dispatchEmails } from "@/app/api/email/dispatch/route";
import { runZatcaCertificateExpiryCheck } from "@/lib/integrations/zatca/certificate-expiry";
import { logger } from "@/lib/ops/logger";
import { requireCronSecret } from "@/lib/security/cron-auth";
import { reportPlatformEvent } from "@/lib/notifications/platform-events";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One scheduled entry for the daily jobs, because the Hobby plan limits how many
 * cron entries a project may have. A failing job never stops the next one.
 */
export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["recurringInvoices", async () => (await runRecurringInvoices(request)).json()],
    ["certificateExpiry", runZatcaCertificateExpiryCheck],
    // Last, so emails queued by the jobs above leave in the same run.
    ["email", async () => (await dispatchEmails(request)).json()],
  ];
  const results: Record<string, unknown> = {};
  let ok = true;
  for (const [name, run] of jobs) {
    try {
      results[name] = await run();
    } catch (error) {
      ok = false;
      results[name] = { error: error instanceof Error ? error.message : String(error) };
      logger.error("Daily cron job failed", { job: name, ...(results[name] as object) });
      await reportPlatformEvent({
        kind: "cron_failed",
        severity: "high",
        title: { ar: "فشل مهمة مجدولة", en: "Scheduled job failed" },
        message: {
          ar: `لم تكتمل المهمة اليومية: ${name}`,
          en: `The daily job did not finish: ${name}`,
        },
        path: "/admin/jobs",
        entityId: name,
        quietMinutes: 720,
      });
    }
  }
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
