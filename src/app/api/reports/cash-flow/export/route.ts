import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { buildCashFlowReport } from "@/lib/utils/financial-statements";
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
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

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

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "cash-flow",
    format,
    filters: { startDate, endDate },
  });

  if (format === "pdf") {
    const lines: string[] = [];
    lines.push("Cash Flow");
    lines.push(`From: ${report.period.startDate}`);
    lines.push(`To: ${report.period.endDate}`);
    lines.push("");
    lines.push(`Opening cash: ${report.openingCash.toFixed(2)}`);
    lines.push(`Net profit: ${report.netProfit.toFixed(2)}`);
    lines.push(`Asset change: ${report.assetChange.toFixed(2)}`);
    lines.push(`Liability change: ${report.liabilityChange.toFixed(2)}`);
    lines.push(`Equity change: ${report.equityChange.toFixed(2)}`);
    lines.push(`Net cash from operations: ${report.netCashFromOperations.toFixed(2)}`);
    lines.push(`Net cash from investing: ${report.netCashFromInvesting.toFixed(2)}`);
    lines.push(`Net cash from financing: ${report.netCashFromFinancing.toFixed(2)}`);
    lines.push(`Other change: ${report.otherChange.toFixed(2)}`);
    lines.push(`Net cash change: ${report.netCashChange.toFixed(2)}`);
    lines.push(`Closing cash: ${report.closingCash.toFixed(2)}`);
    lines.push("");
    report.cashAccounts.forEach((account) => {
      lines.push(
        `${account.name}: ${account.opening.toFixed(2)} -> ${account.closing.toFixed(
          2
        )} (${account.change.toFixed(2)})`
      );
    });

    const buffer = renderPdf(lines);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"cash-flow.pdf\"",
      },
    });
  }

  const headers = ["Section", "Item", "Amount"];
  const rows: string[][] = [
    ["Summary", "Opening cash", report.openingCash.toFixed(2)],
    ["Summary", "Net profit", report.netProfit.toFixed(2)],
    ["Summary", "Asset change", report.assetChange.toFixed(2)],
    ["Summary", "Liability change", report.liabilityChange.toFixed(2)],
    ["Summary", "Equity change", report.equityChange.toFixed(2)],
    ["Summary", "Net cash from operations", report.netCashFromOperations.toFixed(2)],
    ["Summary", "Net cash from investing", report.netCashFromInvesting.toFixed(2)],
    ["Summary", "Net cash from financing", report.netCashFromFinancing.toFixed(2)],
    ["Summary", "Other change", report.otherChange.toFixed(2)],
    ["Summary", "Net cash change", report.netCashChange.toFixed(2)],
    ["Summary", "Closing cash", report.closingCash.toFixed(2)],
  ];

  report.cashAccounts.forEach((account) => {
    rows.push([
      "Cash accounts",
      account.name,
      `${account.opening.toFixed(2)} -> ${account.closing.toFixed(2)} (${account.change.toFixed(
        2
      )})`,
    ]);
  });

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"cash-flow.csv\"",
    },
  });
}

