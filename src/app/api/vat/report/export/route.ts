import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { getVatPeriodById } from "@/lib/data/vat-periods";
import { buildVatSummary } from "@/lib/utils/vat-report";
import { toCsv } from "@/lib/utils/csv";
import { createReportExport } from "@/lib/data/report-exports";
import { vatReturnModel } from "@/lib/pdf/financial-reports";
import { loadReportContext, renderReport } from "@/lib/pdf/report";
import { pdfResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Header values are Latin-1 only, so an Arabic name travels in the encoded form. */
const attachmentName = (name: string) =>
  `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(
    name
  )}`;

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
        "Content-Disposition": attachmentName(`vat-report-${period.name}-zatca.json`),
      },
    });
  }

  if (format === "pdf") {
    const context = await loadReportContext(request, companyId);
    const pdf = await renderReport(
      vatReturnModel(context, { summary, periodName: period.name, status: period.status })
    );
    return pdfResponse(pdf, `vat-return-${period.name}.pdf`, request);
  }

  const headers = ["Section", "Category", "Rate", "Type", "TaxableAmount", "TaxAmount"];
  const rows = buildCsvRows(summary);
  const csv = toCsv(headers, rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentName(`vat-report-${period.name}.csv`),
    },
  });
}

