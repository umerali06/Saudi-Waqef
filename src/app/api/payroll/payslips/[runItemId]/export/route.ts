import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { getEmployeeById } from "@/lib/data/employees";
import { getAccessiblePayslip } from "@/lib/payroll/payslip-access";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runItemId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runItemId } = await context.params;
  const payslip = await getAccessiblePayslip(user.id, runItemId);
  const employee = payslip ? await getEmployeeById(payslip.item.employeeId) : null;
  if (!payslip || !employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { item, run } = payslip;

  const headers = [
    "Employee",
    "Period",
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
  const rows = [
    [
      employee.nameEn || employee.nameAr,
      `${run.periodStart} - ${run.periodEnd}`,
      item.grossPay.toFixed(2),
      item.totalDeductions.toFixed(2),
      item.netPay.toFixed(2),
      item.gosiDeduction?.toFixed(2) ?? "0.00",
      item.incomeTaxDeduction?.toFixed(2) ?? "0.00",
      item.overtimePay.toFixed(2),
      String(item.lateMinutes),
      String(item.unpaidLeaveDays),
      String(item.absentDays),
      item.adjustmentsTotal.toFixed(2),
    ],
  ];
  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"payslip-${runItemId}.csv\"`,
    },
  });
}
