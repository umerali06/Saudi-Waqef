import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { buildAnalyticsOverview } from "@/lib/reports/analytics";
import { toCsv } from "@/lib/utils/csv";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const overview = await buildAnalyticsOverview({
    companyId,
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  });

  const rows: string[][] = [
    ["Generated at", overview.generatedAt],
    ["Range", `${overview.range.startDate} to ${overview.range.endDate}`],
    ["Currency", overview.currency],
    ["Accounting - Revenue", overview.accounting.revenue.toFixed(2)],
    ["Accounting - Expenses", overview.accounting.expenses.toFixed(2)],
    ["Accounting - Overdue invoices", String(overview.accounting.overdueCount)],
    ["Accounting - Overdue amount", overview.accounting.overdueAmount.toFixed(2)],
    ["Accounting - Cash balance", overview.accounting.cashBalance.toFixed(2)],
    ["Accounting - Net cash flow", overview.accounting.netCashFlow.toFixed(2)],
    ["VAT - Output VAT", overview.vat.outputVat.toFixed(2)],
    ["VAT - Input VAT", overview.vat.inputVat.toFixed(2)],
    ["VAT - Net VAT", overview.vat.netVat.toFixed(2)],
    ["HR - Headcount", String(overview.hr.headcount)],
    ["HR - Active employees", String(overview.hr.activeEmployees)],
    ["HR - Absenteeism rate", `${(overview.hr.absenteeismRate * 100).toFixed(1)}%`],
    ["HR - Payroll cost", overview.hr.payrollCost.toFixed(2)],
    ["HR - Leave days", overview.hr.leaveDays.toFixed(1)],
  ];

  if (overview.details.topCustomers.length > 0) {
    rows.push(["Top customers", ""]);
    overview.details.topCustomers.forEach((customer) => {
      rows.push([customer.customerName, customer.total.toFixed(2)]);
    });
  }

  if (overview.details.expenseCategories.length > 0) {
    rows.push(["Expense categories", ""]);
    overview.details.expenseCategories.forEach((category) => {
      rows.push([category.categoryName, category.total.toFixed(2)]);
    });
  }

  if (overview.details.overdueInvoices.length > 0) {
    rows.push(["Overdue invoices", ""]);
    overview.details.overdueInvoices.forEach((invoice) => {
      rows.push([invoice.invoiceNumber, invoice.balance.toFixed(2)]);
    });
  }

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "analytics.export",
    entity: "analytics",
    metadata: { range: overview.range },
  });

  const csv = toCsv(["Metric", "Value"], rows);
  const filename = `analytics-${overview.range.startDate}-to-${overview.range.endDate}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
