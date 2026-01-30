import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildProfitLossReport } from "@/lib/utils/financial-statements";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const compareStartDate = searchParams.get("compareStartDate");
  const compareEndDate = searchParams.get("compareEndDate");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
  ]);

  const report = buildProfitLossReport({
    accounts,
    entries,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    compareStartDate: compareStartDate ?? null,
    compareEndDate: compareEndDate ?? null,
  });

  return NextResponse.json(report);
}

