import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";

export const runtime = "nodejs";

const isDateInRange = (date: string, startDate?: string | null, endDate?: string | null) => {
  if (startDate && date < startDate) {
    return false;
  }
  if (endDate && date > endDate) {
    return false;
  }
  return true;
};

const renderPdf = (
  title: string,
  accountLabel: string,
  startDate: string | null,
  endDate: string | null,
  openingBalance: number,
  closingBalance: number,
  lines: { date: string; memo: string; source: string; debit: number; credit: number; balance: number }[]
) => {
  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const headerLines = [
    title,
    `Account: ${accountLabel}`,
    `From: ${startDate ?? "-"}`,
    `To: ${endDate ?? "-"}`,
    `Opening balance: ${openingBalance.toFixed(2)}`,
    `Closing balance: ${closingBalance.toFixed(2)}`,
    "",
    "Date | Memo | Source | Debit | Credit | Balance",
  ];

  const detailLines = lines.map(
    (line) =>
      `${line.date} | ${line.memo || "-"} | ${line.source} | ${line.debit.toFixed(
        2
      )} | ${line.credit.toFixed(2)} | ${line.balance.toFixed(2)}`
  );

  const contentLines: string[] = [];
  let y = 760;
  [...headerLines, ...detailLines].forEach((line) => {
    contentLines.push(`BT /F1 9 Tf 40 ${y} Td (${escapeText(line)}) Tj ET`);
    y -= 14;
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
  const accountId = searchParams.get("accountId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId || !accountId) {
    return NextResponse.json(
      { error: "companyId and accountId are required" },
      { status: 400 }
    );
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [accounts, entries] = await Promise.all([
    listChartAccounts(companyId),
    listJournalEntries(companyId),
  ]);

  const account = accounts.find((entry) => entry.id === accountId);
  if (!account) {
    return NextResponse.json({ error: "Invalid account" }, { status: 400 });
  }

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "general-ledger",
    format,
    filters: {
      accountId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
    },
  });

  let openingBalance = 0;
  const lines: {
    date: string;
    memo: string;
    source: string;
    debit: number;
    credit: number;
    balance?: number;
  }[] = [];

  entries.forEach((entry) => {
    if (entry.status === "draft" || entry.status === "void") {
      return;
    }
    const isBeforeStart = startDate && entry.date < startDate;
    if (isBeforeStart) {
      entry.lines.forEach((line) => {
        if (line.accountId === accountId) {
          openingBalance += line.debit - line.credit;
        }
      });
      return;
    }

    if (!isDateInRange(entry.date, startDate, endDate)) {
      return;
    }

    entry.lines.forEach((line) => {
      if (line.accountId !== accountId) {
        return;
      }
      lines.push({
        date: entry.date,
        memo: entry.memo ?? "",
        source: entry.sourceType,
        debit: line.debit,
        credit: line.credit,
      });
    });
  });

  lines.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = openingBalance;
  const ledgerLines = lines.map((line) => {
    runningBalance += line.debit - line.credit;
    return { ...line, balance: runningBalance };
  });

  if (format === "pdf") {
    const buffer = renderPdf(
      "General Ledger",
      `${account.code} - ${account.name}`,
      startDate,
      endDate,
      openingBalance,
      runningBalance,
      ledgerLines.map((line) => ({
        date: line.date,
        memo: line.memo,
        source: line.source,
        debit: line.debit,
        credit: line.credit,
        balance: line.balance ?? 0,
      }))
    );
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="general-ledger-${account.code}.pdf"`,
      },
    });
  }

  const headers = ["Date", "Memo", "Source", "Debit", "Credit", "Balance"];
  const rows = ledgerLines.map((line) => [
    line.date,
    line.memo ?? "",
    line.source,
    line.debit.toFixed(2),
    line.credit.toFixed(2),
    (line.balance ?? 0).toFixed(2),
  ]);
  const csv = toCsv(headers, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="general-ledger-${account.code}.csv"`,
    },
  });
}

