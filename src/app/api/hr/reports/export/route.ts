import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { buildHrReport } from "@/lib/reports/hr-reports";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { hrReportModel } from "@/lib/pdf/financial-reports";
import { loadReportContext, renderReport } from "@/lib/pdf/report";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

const escapeCsvValue = (value: string) => {
  const needsQuotes = value.includes(",") || value.includes("\"") || value.includes("\n");
  const escaped = value.replace(/\"/g, "\"\"");
  return needsQuotes ? `"${escaped}"` : escaped;
};

const csvSection = (title: string, headers: string[], rows: string[][]) => {
  const lines: string[] = [];
  lines.push(escapeCsvValue(title));
  lines.push(headers.map(escapeCsvValue).join(","));
  rows.forEach((row) => {
    lines.push(row.map((cell) => escapeCsvValue(cell)).join(","));
  });
  lines.push("");
  return lines.join("\n");
};

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const reportType = searchParams.get("report") ?? "summary";
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = await buildHrReport({
    companyId,
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    departmentId: searchParams.get("departmentId"),
  });

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "hr.reports.export",
    entity: "hr_report",
    entityId: `${reportType}:${format}`,
    metadata: {
      startDate: report.range.startDate,
      endDate: report.range.endDate,
      departmentId: searchParams.get("departmentId") ?? null,
    },
  });

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(hrReportModel(context, report));
    return pdfResponse(pdf, `hr-report-${report.range.startDate}-${report.range.endDate}.pdf`, request);
  }

  if (format !== "csv") {
    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  }

  let csv = "";
  if (reportType === "employees") {
    csv =
      csvSection(
        "Headcount by department",
        ["Department", "Count"],
        report.employees.byDepartment.map((entry) => [
          entry.nameEn,
          String(entry.count),
        ])
      ) +
      csvSection(
        "Headcount by position",
        ["Position", "Count"],
        report.employees.byPosition.map((entry) => [entry.nameEn, String(entry.count)])
      ) +
      csvSection(
        "Headcount by status",
        ["Status", "Count"],
        report.employees.byStatus.map((entry) => [entry.status, String(entry.count)])
      ) +
      csvSection(
        "New hires",
        ["Employee", "Hire date"],
        report.employees.hires.map((entry) => [
          entry.nameEn,
          entry.hireDate ?? "",
        ])
      ) +
      csvSection(
        "Terminations",
        ["Employee", "Termination date"],
        report.employees.terminations.map((entry) => [
          entry.nameEn,
          entry.terminationDate ?? "",
        ])
      );
  } else if (reportType === "attendance") {
    csv =
      csvSection(
        "Attendance by employee",
        [
          "Employee",
          "Present days",
          "Late days",
          "Absent days",
          "Leave days",
          "Overtime minutes",
          "Late minutes",
        ],
        report.attendance.byEmployee.map((entry) => [
          entry.nameEn,
          String(entry.presentDays),
          String(entry.lateDays),
          String(entry.absentDays),
          String(entry.leaveDays),
          String(entry.overtimeMinutes),
          String(entry.lateMinutes),
        ])
      ) +
      csvSection(
        "Attendance by department",
        [
          "Department",
          "Present days",
          "Late days",
          "Absent days",
          "Leave days",
          "Overtime minutes",
        ],
        report.attendance.byDepartment.map((entry) => [
          entry.nameEn,
          String(entry.presentDays),
          String(entry.lateDays),
          String(entry.absentDays),
          String(entry.leaveDays),
          String(entry.overtimeMinutes),
        ])
      );
  } else if (reportType === "leave") {
    csv =
      csvSection(
        "Leave balances",
        ["Employee", "Leave type", "Allowance", "Adjustments", "Used", "Remaining"],
        report.leave.balances.map((entry) => [
          entry.nameEn,
          entry.leaveTypeName,
          entry.allowance.toFixed(2),
          entry.adjustments.toFixed(2),
          entry.used.toFixed(2),
          entry.remaining.toFixed(2),
        ])
      ) +
      csvSection(
        "Pending leave requests",
        ["Employee", "Leave type", "Start date", "End date", "Days", "Status"],
        report.leave.pendingRequests.map((entry) => [
          entry.nameEn,
          entry.leaveTypeName,
          entry.startDate,
          entry.endDate,
          String(entry.days),
          entry.status,
        ])
      );
  } else if (reportType === "payroll") {
    const current = report.payroll.currentRun;
    csv =
      csvSection(
        "Payroll summary",
        ["Period", "Gross", "Deductions", "Net", "Status"],
        current
          ? [
              [
                `${current.periodStart} - ${current.periodEnd}`,
                current.totals.grossPay.toFixed(2),
                current.totals.totalDeductions.toFixed(2),
                current.totals.netPay.toFixed(2),
                current.status,
              ],
            ]
          : []
      ) +
      csvSection(
        "Payroll by department",
        ["Department", "Employees", "Gross", "Deductions", "Net"],
        report.payroll.byDepartment.map((entry) => [
          entry.nameEn,
          String(entry.employeeCount),
          entry.grossPay.toFixed(2),
          entry.totalDeductions.toFixed(2),
          entry.netPay.toFixed(2),
        ])
      ) +
      csvSection(
        "Net pay distribution",
        ["Range", "Employees", "Total net"],
        report.payroll.netDistribution.map((entry) => [
          entry.range,
          String(entry.count),
          entry.total.toFixed(2),
        ])
      );
  } else {
    csv = csvSection(
      "HR KPI summary",
      ["Metric", "Value"],
      [
        ["Headcount", String(report.kpis.headcount)],
        ["Active employees", String(report.kpis.activeEmployees)],
        ["Absenteeism rate", `${(report.kpis.absenteeismRate * 100).toFixed(1)}%`],
        ["Overtime hours", report.kpis.overtimeHours.toFixed(2)],
        ["Leave days", report.kpis.leaveDays.toFixed(1)],
        ["Payroll cost", report.kpis.payrollCost.toFixed(2)],
      ]
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"hr-${reportType}-${report.range.startDate}-${report.range.endDate}.csv\"`,
    },
  });
}
