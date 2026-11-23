import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { getPayrollRun } from "@/lib/data/payroll-runs";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";
import { getEmployeeContractById } from "@/lib/data/employee-contracts";
import { buildWageFileCsv } from "@/lib/integrations/mudad/payload";
import { buildFilingRows, findFilingIssues } from "@/lib/integrations/payroll-source";
import { getEmployeeById, listEmployees } from "@/lib/data/employees";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runId } = await context.params;
  const run = await getPayrollRun(runId);
  if (!run || run.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const items = await listPayrollRunItems(runId);
  if (format === "wage-file") {
    if (run.status === "draft") {
      return NextResponse.json({ error: "PAYROLL_RUN_NOT_APPROVED" }, { status: 400 });
    }
    const employees = await listEmployees(companyId);
    const contracts = new Map(
      await Promise.all(
        [...new Set(items.map((item) => item.contractId))].map(
          async (id) => [id, id ? await getEmployeeContractById(id) : null] as const
        )
      )
    );
    const wageRows = buildFilingRows({ employees, items, contracts });
    const issues = findFilingIssues(wageRows, { requireIban: true });
    if (issues.length > 0) {
      return NextResponse.json({ error: "PAYROLL_FILING_INCOMPLETE", issues }, { status: 422 });
    }
    return new Response(buildWageFileCsv(wageRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wage-file-${run.periodEnd.slice(0, 7)}.csv"`,
      },
    });
  }
  if (format !== "csv") {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  const headers = [
    "Employee",
    "Gross",
    "Deductions",
    "Net",
    "GosiDeduction",
    "IncomeTax",
    "Overtime",
    "LateMinutes",
    "UnpaidLeaveDays",
    "AbsenceDays",
    "Adjustments",
  ];
  const rows = await Promise.all(
    items.map(async (item) => {
      const employee = await getEmployeeById(item.employeeId);
      const name = employee?.nameEn || employee?.nameAr || item.employeeId;
      return [
        name,
        item.grossPay.toFixed(2),
        item.totalDeductions.toFixed(2),
        item.netPay.toFixed(2),
        (item.gosiDeduction ?? 0).toFixed(2),
        (item.incomeTaxDeduction ?? 0).toFixed(2),
        item.overtimePay.toFixed(2),
        String(item.lateMinutes),
        String(item.unpaidLeaveDays),
        String(item.absentDays),
        item.adjustmentsTotal.toFixed(2),
      ];
    })
  );

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"payroll-run-${run.periodStart}-${run.periodEnd}.csv\"`,
    },
  });
}

