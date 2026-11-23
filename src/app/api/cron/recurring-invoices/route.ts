import { NextResponse } from "next/server";
import { runRecurringInvoices } from "@/lib/accounting/recurring";
import { getCompanyById } from "@/lib/data/companies";
import { listCompaniesWithDueSchedules } from "@/lib/data/recurring-invoices";
import { requireCronSecret } from "@/lib/security/cron-auth";
import { riyadhDate } from "@/lib/utils/riyadh";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const today = riyadhDate();
  const companies = [];
  for (const companyId of await listCompaniesWithDueSchedules(today)) {
    const company = await getCompanyById(companyId);
    if (!company || company.status === "suspended") {
      continue;
    }
    try {
      const { created, failed } = await runRecurringInvoices(companyId, today);
      companies.push({ companyId, created: created.length, failed });
    } catch (error) {
      console.error(`Recurring invoices failed for company ${companyId}`, error);
      companies.push({ companyId, created: 0, error: true });
    }
  }

  return NextResponse.json({ ok: true, companies });
}
