import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildBalanceSheetReport } from "@/lib/utils/financial-statements";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const asOfDate = searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);

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

  const report = buildBalanceSheetReport({
    accounts,
    entries,
    asOfDate,
  });

  return NextResponse.json(report);
}

