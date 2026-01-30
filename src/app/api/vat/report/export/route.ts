import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { getVatPeriodById } from "@/lib/data/vat-periods";
import { buildVatSummary } from "@/lib/utils/vat-report";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";

export const runtime = "nodejs";

const buildCsvRows = (summary: Awaited<ReturnType<typeof buildVatSummary>>) => {
  const rows: string[][] = [];
  rows.push(["Summary", "Sales", "", "", summary.sales.netAmount.toFixed(2), summary.sales.taxAmount.toFixed(2)]);
  rows.push([
    "Summary",
    "Purchases",
    "",
    "",
    summary.purchases.netAmount.toFixed(2),
    summary.purchases.taxAmount.toFixed(2),
  ]);
  rows.push([
    "Adjustments",
    "Output VAT",
    "",
    "",
    "",
    summary.adjustments.output.toFixed(2),
  ]);
  rows.push([
    "Adjustments",
    "Input VAT",
    "",
    "",
    "",
    summary.adjustments.input.toFixed(2),
  ]);
  rows.push([
    "Net VAT",
    "Total",
    "",
    "",
    "",
    summary.netVat.toFixed(2),
  ]);

  summary.breakdown.sales.forEach((entry) => {
    rows.push([
      "Sales breakdown",
      "",
      entry.rate.toFixed(2),
      entry.type,
      entry.taxableAmount.toFixed(2),
      entry.taxAmount.toFixed(2),
    ]);
  });

  summary.breakdown.purchases.forEach((entry) => {
    rows.push([
      "Purchases breakdown",
      "",
      entry.rate.toFixed(2),
      entry.type,
      entry.taxableAmount.toFixed(2),
      entry.taxAmount.toFixed(2),
    ]);
  });

  return rows;
};

const buildZatcaMapping = (
  summary: Awaited<ReturnType<typeof buildVatSummary>>,
  period: Awaited<ReturnType<typeof getVatPeriodById>>
) => {
  if (!period) {
    return null;
  }
  return {
    schemaVersion: "0.1",
    generatedAt: new Date().toISOString(),
    period: {
      id: period.id,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      frequency: period.frequency,
      status: period.status,
      filedAt: period.filedAt ?? null,
    },
    totals: {
      outputVat: summary.outputVat,
      inputVat: summary.inputVat,
      netVat: summary.netVat,
    },
    sales: summary.sales,
    purchases: summary.purchases,
    adjustments: summary.adjustments,
    breakdown: summary.breakdown,
  };
};

const renderPdf = (
  summary: Awaited<ReturnType<typeof buildVatSummary>>,
  periodName: string,
  startDate: string,
  endDate: string
) => {
  const escapeText = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

  const lines = [
    "VAT Summary Report",
    `Period: ${periodName}`,
    `From: ${startDate}`,
    `To: ${endDate}`,
    "",
    "Summary",
    `Sales net: ${summary.sales.netAmount.toFixed(2)}`,
    `Sales VAT: ${summary.sales.taxAmount.toFixed(2)}`,
    `Purchases net: ${summary.purchases.netAmount.toFixed(2)}`,
    `Purchases VAT: ${summary.purchases.taxAmount.toFixed(2)}`,
    `Adjustments (output): ${summary.adjustments.output.toFixed(2)}`,
    `Adjustments (input): ${summary.adjustments.input.toFixed(2)}`,
    `Net VAT: ${summary.netVat.toFixed(2)}`,
    "",
    "Sales breakdown",
    ...summary.breakdown.sales.map(
      (entry) =>
        `Rate ${entry.rate.toFixed(2)}% (${entry.type}) - Taxable: ${entry.taxableAmount.toFixed(
          2
        )}, VAT: ${entry.taxAmount.toFixed(2)}`
    ),
    "",
    "Purchases breakdown",
    ...summary.breakdown.purchases.map(
      (entry) =>
        `Rate ${entry.rate.toFixed(2)}% (${entry.type}) - Taxable: ${entry.taxableAmount.toFixed(
          2
        )}, VAT: ${entry.taxAmount.toFixed(2)}`
    ),
  ];

  const contentLines: string[] = [];
  let y = 760;
  lines.forEach((line) => {
    contentLines.push(`BT /F1 11 Tf 50 ${y} Td (${escapeText(line)}) Tj ET`);
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
  const periodId = searchParams.get("periodId");
  const format = (searchParams.get("format") ?? "csv").toLowerCase();

  if (!companyId || !periodId) {
    return NextResponse.json(
      { error: "companyId and periodId are required" },
      { status: 400 }
    );
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = await getVatPeriodById(periodId);
  if (!period || period.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const summary =
    period.status === "filed" && period.filedSummary
      ? (period.filedSummary as Awaited<ReturnType<typeof buildVatSummary>>)
      : await buildVatSummary({
          companyId,
          startDate: period.startDate,
          endDate: period.endDate,
          periodId,
        });

  await createReportExport({
    companyId,
    userId: user.id,
    userEmail: user.email ?? null,
    reportType: "vat",
    format,
    filters: {
      periodId,
      periodName: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
    },
  });

  if (format === "zatca" || format === "json") {
    const mapping = buildZatcaMapping(summary, period);
    return NextResponse.json(mapping, {
      headers: {
        "Content-Disposition": `attachment; filename="vat-report-${period.name}-zatca.json"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = renderPdf(summary, period.name, period.startDate, period.endDate);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="vat-report-${period.name}.pdf"`,
      },
    });
  }

  const headers = ["Section", "Category", "Rate", "Type", "TaxableAmount", "TaxAmount"];
  const rows = buildCsvRows(summary);
  const csv = toCsv(headers, rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vat-report-${period.name}.csv"`,
    },
  });
}

