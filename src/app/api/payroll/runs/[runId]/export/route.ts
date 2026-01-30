import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess } from "@/lib/access";
import { getPayrollRun } from "@/lib/data/payroll-runs";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";
import { getEmployeeById } from "@/lib/data/employees";
import { toCsv } from "@/lib/utils/csv";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

const renderPdfPages = (pages: string[][]) => {
  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const objects: string[] = [];
  const pageIds: number[] = [];
  const contentIds: number[] = [];
  const fontId = 3 + pages.length * 2;

  pages.forEach((lines, index) => {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    contentIds.push(contentId);

    const contentLines: string[] = [];
    let y = 760;
    lines.forEach((line) => {
      contentLines.push(`BT /F1 11 Tf 40 ${y} Td (${escapeText(line)}) Tj ET`);
      y -= 16;
      if (y < 40) {
        y = 760;
      }
    });
    const stream = contentLines.join("\n");
    const streamLength = Buffer.byteLength(stream, "utf8");

    objects.push(
      `${pageId} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >> endobj\n`
    );
    objects.push(
      `${contentId} 0 obj << /Length ${streamLength} >> stream\n${stream}\nendstream endobj\n`
    );
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const header = "%PDF-1.4\n";
  const catalog = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n";
  const pagesObj = `2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageIds.length} >> endobj\n`;
  const fontObj = `${fontId} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n`;

  const allObjects = [catalog, pagesObj, ...objects, fontObj];

  let offset = header.length;
  const offsets = [0];
  const body = allObjects
    .map((obj) => {
      offsets.push(offset);
      offset += obj.length;
      return obj;
    })
    .join("");

  const xrefStart = header.length + body.length;
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((objOffset) => {
    xref += `${String(objOffset).padStart(10, "0")} 00000 n \n`;
  });
  const trailer = `trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "utf8");
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();
  const lang = searchParams.get("lang") === "ar" ? "ar" : "en";
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
  if (format === "pdf") {
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

    const pages = await Promise.all(
      items.map(async (item) => {
        const employee = await getEmployeeById(item.employeeId);
        const name = employee?.nameEn || employee?.nameAr || item.employeeId;
        return [
          labels.title,
          `${labels.employee}: ${name}`,
          `${labels.period}: ${run.periodStart} - ${run.periodEnd}`,
          "",
          `${labels.gross}: ${item.grossPay.toFixed(2)} ${item.currency}`,
          `${labels.deductions}: ${item.totalDeductions.toFixed(2)} ${item.currency}`,
          `${labels.gosi}: ${(item.gosiDeduction ?? 0).toFixed(2)} ${item.currency}`,
          `${labels.tax}: ${(item.incomeTaxDeduction ?? 0).toFixed(2)} ${item.currency}`,
          `${labels.net}: ${item.netPay.toFixed(2)} ${item.currency}`,
          "",
          `${labels.overtime}: ${item.overtimePay.toFixed(2)} ${item.currency}`,
          `${labels.late}: ${item.lateMinutes}`,
          `${labels.unpaidLeave}: ${item.unpaidLeaveDays}`,
          `${labels.absences}: ${item.absentDays}`,
          `${labels.adjustments}: ${item.adjustmentsTotal.toFixed(2)} ${item.currency}`,
        ];
      })
    );

    const buffer = renderPdfPages(pages);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=\"payroll-payslips-${run.periodStart}-${run.periodEnd}.pdf\"`,
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

