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
  startDate: string | null,
  endDate: string | null,
  rows: {
    label: string;
    openingDebit: number;
    openingCredit: number;
    movementDebit: number;
    movementCredit: number;
    closingDebit: number;
    closingCredit: number;
    compareDebit?: number;
    compareCredit?: number;
  }[],
  includeCompare: boolean
) => {
  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const headerLines = [
    title,
    `From: ${startDate ?? "-"}`,
    `To: ${endDate ?? "-"}`,
    "",
    includeCompare
      ? "Account | Opening Dr | Opening Cr | Movement Dr | Movement Cr | Closing Dr | Closing Cr | Compare Dr | Compare Cr"
      : "Account | Opening Dr | Opening Cr | Movement Dr | Movement Cr | Closing Dr | Closing Cr",
  ];

  const detailLines = rows.map((row) => {
    const base = `${row.label} | ${row.openingDebit.toFixed(2)} | ${row.openingCredit.toFixed(
      2
    )} | ${row.movementDebit.toFixed(2)} | ${row.movementCredit.toFixed(2)} | ${row.closingDebit.toFixed(
      2
    )} | ${row.closingCredit.toFixed(2)}`;
    if (!includeCompare) {
      return base;
    }
    return `${base} | ${(row.compareDebit ?? 0).toFixed(2)} | ${(row.compareCredit ?? 0).toFixed(
      2
    )}`;
  });

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

  const totals = new Map<
    string,
    {
      opening: { debit: number; credit: number };
      movement: { debit: number; credit: number };
      compare: { debit: number; credit: number };
    }
  >();

  entries.forEach((entry) => {
    if (entry.status === "draft" || entry.status === "void") {
      return;
    }
    entry.lines.forEach((line) => {
      const current = totals.get(line.accountId) ?? {
        opening: { debit: 0, credit: 0 },
        movement: { debit: 0, credit: 0 },
        compare: { debit: 0, credit: 0 },
      };

      if (startDate && entry.date < startDate) {
        current.opening.debit += line.debit;
        current.opening.credit += line.credit;
      } else if (isDateInRange(entry.date, startDate, endDate)) {
        current.movement.debit += line.debit;
        current.movement.credit += line.credit;
      }

      if (compareStartDate && compareEndDate) {
        if (isDateInRange(entry.date, compareStartDate, compareEndDate)) {
          current.compare.debit += line.debit;
          current.compare.credit += line.credit;
        }
      }

      totals.set(line.accountId, current);
    });
  });

  const rows = accounts
    .filter((account) => account.isPosting)
    .map((account) => {
      const summary = totals.get(account.id) ?? {
        opening: { debit: 0, credit: 0 },
        movement: { debit: 0, credit: 0 },
        compare: { debit: 0, credit: 0 },
      };
      const openingNet = summary.opening.debit - summary.opening.credit;
      const movementNet = summary.movement.debit - summary.movement.credit;
      const closingNet = openingNet + movementNet;
      const compareNet = summary.compare.debit - summary.compare.credit;
      return {
        accountId: account.id,
        label: `${account.code} - ${account.name}`,
        openingDebit: openingNet >= 0 ? openingNet : 0,
        openingCredit: openingNet < 0 ? Math.abs(openingNet) : 0,
        movementDebit: summary.movement.debit,
        movementCredit: summary.movement.credit,
        closingDebit: closingNet >= 0 ? closingNet : 0,
        closingCredit: closingNet < 0 ? Math.abs(closingNet) : 0,
        compareDebit: compareNet >= 0 ? compareNet : 0,
        compareCredit: compareNet < 0 ? Math.abs(compareNet) : 0,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const includeCompare = Boolean(compareStartDate && compareEndDate);

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "trial-balance",
    format,
    filters: {
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      compareStartDate: compareStartDate ?? null,
      compareEndDate: compareEndDate ?? null,
    },
  });

  if (format === "pdf") {
    const buffer = renderPdf(
      "Trial Balance",
      startDate ?? null,
      endDate ?? null,
      rows,
      includeCompare
    );
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"trial-balance.pdf\"",
      },
    });
  }

  const headers = includeCompare
    ? [
        "Account",
        "OpeningDebit",
        "OpeningCredit",
        "MovementDebit",
        "MovementCredit",
        "ClosingDebit",
        "ClosingCredit",
        "CompareDebit",
        "CompareCredit",
      ]
    : [
        "Account",
        "OpeningDebit",
        "OpeningCredit",
        "MovementDebit",
        "MovementCredit",
        "ClosingDebit",
        "ClosingCredit",
      ];

  const csvRows = rows.map((row) => {
    const base = [
      row.label,
      row.openingDebit.toFixed(2),
      row.openingCredit.toFixed(2),
      row.movementDebit.toFixed(2),
      row.movementCredit.toFixed(2),
      row.closingDebit.toFixed(2),
      row.closingCredit.toFixed(2),
    ];
    if (!includeCompare) {
      return base;
    }
    return [...base, row.compareDebit.toFixed(2), row.compareCredit.toFixed(2)];
  });

  const csv = toCsv(headers, csvRows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"trial-balance.csv\"",
    },
  });
}

