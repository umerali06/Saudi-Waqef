import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildProfitLossReport } from "@/lib/utils/financial-statements";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";

export const runtime = "nodejs";

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
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

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

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "profit-loss",
    format,
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      compareStartDate: compareStartDate ?? null,
      compareEndDate: compareEndDate ?? null,
    },
  });

  if (format === "pdf") {
    const lines: string[] = [];
    lines.push("Profit & Loss");
    lines.push(`From: ${report.period.startDate ?? "-"}`);
    lines.push(`To: ${report.period.endDate ?? "-"}`);
    if (report.comparePeriod) {
      lines.push(
        `Compare: ${report.comparePeriod.startDate} to ${report.comparePeriod.endDate}`
      );
    }
    lines.push("");
    lines.push(`Revenue: ${report.revenue.total.toFixed(2)}`);
    report.revenue.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`COGS: ${report.cogs.total.toFixed(2)}`);
    report.cogs.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`Gross profit: ${report.grossProfit.toFixed(2)}`);
    lines.push(`Expenses: ${report.expenses.total.toFixed(2)}`);
    report.expenses.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`Net profit: ${report.netProfit.toFixed(2)}`);

    const buffer = renderPdf(lines);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"profit-loss.pdf\"",
      },
    });
  }

  const includeCompare = Boolean(report.comparePeriod);
  const headers = includeCompare
    ? ["Section", "Account", "Amount", "CompareAmount"]
    : ["Section", "Account", "Amount"];
  const rows: string[][] = [];

  const pushSection = (label: string, section: typeof report.revenue, compare?: typeof report.revenue) => {
    rows.push([label, "", section.total.toFixed(2), compare?.total.toFixed(2) ?? ""]);
    section.accounts.forEach((account) => {
      const compareAccount = compare?.accounts.find((item) => item.accountId === account.accountId);
      rows.push([
        label,
        `${account.code} - ${account.name}`,
        account.amount.toFixed(2),
        compareAccount ? compareAccount.amount.toFixed(2) : "",
      ]);
    });
  };

  pushSection("Revenue", report.revenue, report.compare?.revenue);
  pushSection("COGS", report.cogs, report.compare?.cogs);
  rows.push([
    "Gross profit",
    "",
    report.grossProfit.toFixed(2),
    report.compare ? report.compare.grossProfit.toFixed(2) : "",
  ]);
  pushSection("Expenses", report.expenses, report.compare?.expenses);
  rows.push([
    "Net profit",
    "",
    report.netProfit.toFixed(2),
    report.compare ? report.compare.netProfit.toFixed(2) : "",
  ]);

  const csv = toCsv(headers, rows.map((row) => (includeCompare ? row : row.slice(0, 3))));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"profit-loss.csv\"",
    },
  });
}

