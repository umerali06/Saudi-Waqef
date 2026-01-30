import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { hasRequiredRole, requireHrAccess } from "@/lib/access";
import { getPayrollRunItem } from "@/lib/data/payroll-run-items";
import { getPayrollRun } from "@/lib/data/payroll-runs";
import { getEmployeeById, getEmployeeByUserId } from "@/lib/data/employees";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runItemId: string }>;
};

const renderPdf = (lines: string[]) => {
  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const contentLines: string[] = [];
  let y = 760;
  lines.forEach((line) => {
    contentLines.push(`BT /F1 11 Tf 40 ${y} Td (${escapeText(line)}) Tj ET`);
    y -= 16;
  });

  const stream = contentLines.join("\n");
  const streamLength = Buffer.byteLength(stream, "utf8");

  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n",
    `4 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];

  let offset = 0;
  const header = "%PDF-1.4\n";
  offset += header.length;
  const offsets = [0];
  const body = objects
    .map((obj) => {
      offsets.push(offset);
      offset += obj.length;
      return obj;
    })
    .join("");

  const xrefStart = header.length + body.length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  offsets.slice(1).forEach((objOffset) => {
    xref += `${String(objOffset).padStart(10, "0")} 00000 n \n`;
  });
  const trailer = `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "utf8");
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const format = (searchParams.get("format") ?? "pdf").toLowerCase();
  const lang = searchParams.get("lang") === "ar" ? "ar" : "en";

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { runItemId } = await context.params;
  const item = await getPayrollRunItem(runItemId);
  if (!item || item.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!hasRequiredRole(membership.role, ["owner", "admin", "hr"])) {
    const employee = await getEmployeeByUserId(companyId, user.id);
    if (!employee || employee.id !== item.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const run = await getPayrollRun(item.runId);
  const employee = await getEmployeeById(item.employeeId);
  if (!run || !employee) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const labels = {
    title: lang === "ar" ? "قسيمة راتب" : "Payslip",
    employee: lang === "ar" ? "الموظف" : "Employee",
    period: lang === "ar" ? "الفترة" : "Period",
    gross: lang === "ar" ? "إجمالي" : "Gross",
    deductions: lang === "ar" ? "الاستقطاعات" : "Deductions",
    net: lang === "ar" ? "الصافي" : "Net",
    gosi: lang === "ar" ? "خصم التأمينات" : "GOSI deduction",
    tax: lang === "ar" ? "خصم الضريبة" : "Income tax",
    overtime: lang === "ar" ? "إضافي" : "Overtime",
    late: lang === "ar" ? "تأخير" : "Late minutes",
    unpaidLeave: lang === "ar" ? "خصم إجازة غير مدفوعة" : "Unpaid leave",
    absences: lang === "ar" ? "خصم الغياب" : "Absence",
    adjustments: lang === "ar" ? "تعديلات" : "Adjustments",
  };

  if (format === "csv") {
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

  const lines: string[] = [];
  lines.push(labels.title);
  lines.push(`${labels.employee}: ${employee.nameEn || employee.nameAr}`);
  lines.push(`${labels.period}: ${run.periodStart} - ${run.periodEnd}`);
  lines.push("");
  lines.push(`${labels.gross}: ${item.grossPay.toFixed(2)} ${item.currency}`);
  lines.push(`${labels.deductions}: ${item.totalDeductions.toFixed(2)} ${item.currency}`);
  lines.push(
    `${labels.gosi}: ${(item.gosiDeduction ?? 0).toFixed(2)} ${item.currency}`
  );
  lines.push(
    `${labels.tax}: ${(item.incomeTaxDeduction ?? 0).toFixed(2)} ${item.currency}`
  );
  lines.push(`${labels.net}: ${item.netPay.toFixed(2)} ${item.currency}`);
  lines.push("");
  lines.push(`${labels.overtime}: ${item.overtimePay.toFixed(2)} ${item.currency}`);
  lines.push(`${labels.late}: ${item.lateMinutes}`);
  lines.push(`${labels.unpaidLeave}: ${item.unpaidLeaveDays}`);
  lines.push(`${labels.absences}: ${item.absentDays}`);
  lines.push(`${labels.adjustments}: ${item.adjustmentsTotal.toFixed(2)} ${item.currency}`);

  const buffer = renderPdf(lines);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=\"payslip-${runItemId}.pdf\"`,
    },
  });
}

