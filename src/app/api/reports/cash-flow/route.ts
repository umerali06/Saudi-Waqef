import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { buildCashFlowReport } from "@/lib/utils/financial-statements";

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

  if (!companyId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "companyId, startDate, and endDate are required" },
      { status: 400 }
    );
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries, cashAccounts] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
    listCashBankAccounts(companyId),
  ]);

  const report = buildCashFlowReport({
    accounts,
    entries,
    cashAccounts: cashAccounts.map((account) => ({
      accountId: account.accountId,
      name: account.name,
      openingBalance: account.openingBalance,
    })),
    startDate,
    endDate,
  });

  return NextResponse.json(report);
}

