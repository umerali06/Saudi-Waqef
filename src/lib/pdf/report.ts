import type { Locale } from "@/i18n/messages";
import { messages } from "@/i18n/messages";
import { getCompanyById } from "@/lib/data/companies";
import { MUTED, PdfBuilder, WASH, type Column } from "@/lib/pdf/builder";
import { riyadhDate } from "@/lib/utils/riyadh";

export type ReportCompany = {
  name: string;
  vatNumber?: string | null;
  crNumber?: string | null;
};

export type ReportRow = {
  cells: string[];
  /** Section: a heading row. Subtotal and total: emphasised results. */
  kind?: "line" | "section" | "subtotal" | "total";
};

export type ReportTable = {
  heading?: string;
  columns: Column[];
  rows: ReportRow[];
  /** Shown instead of an empty table. */
  empty?: string;
};

export type ReportModel = {
  locale: Locale;
  company: ReportCompany;
  title: string;
  subtitle?: string;
  tables: ReportTable[];
  /** Key figures printed above the tables. */
  summary?: Array<[label: string, value: string]>;
  notes?: string[];
  landscape?: boolean;
};

export const translator = (locale: Locale) => (key: string) =>
  messages[locale][key] ?? messages.ar[key] ?? key;

/**
 * Amount for a printed column. Negatives use parentheses because a leading
 * minus sign moves to the wrong side of a number inside right-to-left text.
 */
export const reportAmount = (value: number) => {
  const text = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return value < 0 && text !== "0.00" ? `(${text})` : text;
};

/**
 * A date inside a sentence. After Arabic letters a hyphenated date is laid out
 * backwards by the Unicode rules; with slashes it keeps its order.
 */
export const inlineDate = (locale: Locale, date: string) =>
  locale === "ar" ? date.replace(/-/g, "/") : date;

/** "From - to" for the period line of a report. */
export const reportPeriod = (
  locale: Locale,
  startDate?: string | null,
  endDate?: string | null
) => {
  const t = translator(locale);
  return [
    startDate ? `${t("reports.pdf.from")} ${inlineDate(locale, startDate)}` : "",
    endDate ? `${t("reports.pdf.to")} ${inlineDate(locale, endDate)}` : "",
  ]
    .filter(Boolean)
    .join("  ");
};

/** Language and company heading of a report request: `?locale=` or the company's own. */
export async function loadReportContext(request: Request, companyId: string) {
  const requested = new URL(request.url).searchParams.get("locale");
  const company = await getCompanyById(companyId);
  const locale: Locale =
    requested === "ar" || requested === "en"
      ? requested
      : company?.defaultLanguage ?? "ar";
  return {
    locale,
    t: translator(locale),
    company: {
      name: company?.legalName || company?.name || "",
      vatNumber: company?.vatNumber ?? null,
      crNumber: company?.crNumber ?? null,
    } satisfies ReportCompany,
  };
}

/** Company block on the reading side, document title opposite, then a rule. */
export function drawHeading(
  pdf: PdfBuilder,
  params: { company: ReportCompany; title: string; subtitle?: string; locale: Locale; accent?: string }
) {
  const t = translator(params.locale);
  const half = pdf.width / 2 - 8;
  const top = pdf.y;
  const companyX = pdf.boxX(0, half);
  const titleX = pdf.boxX(half + 16, half);

  let companyY = top;
  companyY += pdf.text(params.company.name, companyX, companyY, half, { size: 13, bold: true });
  for (const [label, value] of [
    [t("reports.pdf.vatNumber"), params.company.vatNumber],
    [t("reports.pdf.crNumber"), params.company.crNumber],
  ]) {
    if (value) {
      companyY += pdf.text(`${label}: ${value}`, companyX, companyY, half, { size: 8.5, color: MUTED });
    }
  }
  let titleY = top;
  titleY += pdf.text(params.title, titleX, titleY, half, {
    size: 14,
    bold: true,
    align: "end",
    color: params.accent ?? "#185fa5",
  });
  if (params.subtitle) {
    titleY += pdf.text(params.subtitle, titleX, titleY, half, { size: 9, align: "end", color: MUTED });
  }
  pdf.y = Math.max(companyY, titleY) + 8;
  pdf.rule(params.accent ?? "#185fa5", 1.2);
  pdf.y += 10;
}

/** Label and figure pairs in a shaded band. */
export function drawSummary(pdf: PdfBuilder, summary: Array<[string, string]>) {
  if (summary.length === 0) return;
  const perRow = Math.min(summary.length, 4);
  const width = pdf.width / perRow;
  for (let start = 0; start < summary.length; start += perRow) {
    const row = summary.slice(start, start + perRow);
    pdf.ensure(44);
    pdf.fill(pdf.margin, pdf.y, pdf.width, 38, WASH);
    row.forEach(([label, value], index) => {
      const x = pdf.boxX(index * width, width) + 8;
      pdf.text(label, x, pdf.y + 5, width - 16, { size: 7.5, color: MUTED });
      pdf.text(value, x, pdf.y + 18, width - 16, { size: 10, bold: true });
    });
    pdf.y += 44;
  }
  pdf.y += 4;
}

/** A printed financial or HR report in the reader's language. */
export async function renderReport(model: ReportModel): Promise<Buffer> {
  const t = translator(model.locale);
  const pdf = new PdfBuilder({
    direction: model.locale === "ar" ? "rtl" : "ltr",
    title: `${model.title} - ${model.company.name}`,
    author: model.company.name,
    landscape: model.landscape,
    footer: ({ page, pages }) =>
      [
        model.company.name,
        `${t("reports.pdf.printedOn")} ${inlineDate(model.locale, riyadhDate())}`,
        `${t("reports.pdf.page")} ${page} ${t("reports.pdf.of")} ${pages}`,
      ]
        .filter(Boolean)
        .join("   |   "),
  });
  drawHeading(pdf, model);
  drawSummary(pdf, model.summary ?? []);

  model.tables.forEach((table, index) => {
    if (index > 0) pdf.y += 12;
    if (table.heading) {
      pdf.ensure(70);
      pdf.paragraph(table.heading, { size: 11, bold: true });
      pdf.y += 3;
    }
    if (table.rows.length === 0) {
      pdf.paragraph(table.empty ?? t("reports.pdf.empty"), { size: 9, color: MUTED });
      return;
    }
    pdf.table(
      table.columns,
      table.rows.map((row) => ({
        cells: row.cells,
        bold: row.kind !== undefined && row.kind !== "line",
        topRule: row.kind === "total",
      })),
      { size: model.landscape ? 8 : 8.5, padding: 4 }
    );
  });

  if (model.notes?.length) {
    pdf.y += 10;
    model.notes.forEach((note) => pdf.paragraph(note, { size: 8, color: MUTED }));
  }
  return pdf.finish();
}
