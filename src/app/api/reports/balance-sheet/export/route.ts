import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { buildBalanceSheetReport } from "@/lib/utils/financial-statements";
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
  const asOfDate = searchParams.get("asOfDate") ?? new Date().toISOString().slice(0, 10);
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

  const report = buildBalanceSheetReport({ accounts, entries, asOfDate });

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "balance-sheet",
    format,
    filters: { asOfDate },
  });

  if (format === "pdf") {
    const lines: string[] = [];
    lines.push("Balance Sheet");
    lines.push(`As of: ${report.asOfDate}`);
    lines.push("");
    lines.push(`Assets: ${report.assets.total.toFixed(2)}`);
    report.assets.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`Liabilities: ${report.liabilities.total.toFixed(2)}`);
    report.liabilities.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`Equity: ${report.equity.total.toFixed(2)}`);
    report.equity.accounts.forEach((account) => {
      lines.push(`  ${account.code} - ${account.name}: ${account.amount.toFixed(2)}`);
    });
    lines.push(`Liabilities + Equity: ${report.totals.liabilitiesEquity.toFixed(2)}`);
    lines.push(`Difference: ${report.difference.toFixed(2)}`);

    const buffer = renderPdf(lines);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"balance-sheet.pdf\"",
      },
    });
  }

  const headers = ["Section", "Account", "Amount"];
  const rows: string[][] = [];

  const pushSection = (label: string, section: typeof report.assets) => {
    rows.push([label, "", section.total.toFixed(2)]);
    section.accounts.forEach((account) => {
      rows.push([label, `${account.code} - ${account.name}`, account.amount.toFixed(2)]);
    });
  };

  pushSection("Assets", report.assets);
  pushSection("Liabilities", report.liabilities);
  pushSection("Equity", report.equity);
  rows.push(["Liabilities + Equity", "", report.totals.liabilitiesEquity.toFixed(2)]);
  rows.push(["Difference", "", report.difference.toFixed(2)]);

  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"balance-sheet.csv\"",
    },
  });
}

