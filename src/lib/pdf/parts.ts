import { INK, MUTED, PdfBuilder, RULE, WASH } from "@/lib/pdf/builder";
import type { TaxDocumentParty } from "@/lib/pdf/tax-document";
import { amountInWords } from "@/lib/utils/amount-in-words";

export type DocumentTemplate = "classic" | "modern" | "minimal";

/** Company details and artwork shared by every bilingual company document. */
export type DocumentStyle = {
  seller: TaxDocumentParty;
  header?: string | null;
  footer?: string | null;
  logo?: Buffer | null;
  accent: string;
  template: DocumentTemplate;
};

export const documentMoney = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

export const bilingual = (arabic: string, english: string) => `${arabic}\n${english}`;

export function createDocument(style: DocumentStyle, title: string, number: string) {
  return new PdfBuilder({
    direction: "rtl",
    title: `${title} ${number}`,
    author: style.seller.name,
    footer: ({ page, pages }) =>
      [style.footer?.trim(), number, `صفحة ${page} من ${pages}`].filter(Boolean).join("   |   "),
  });
}

/** Company on the reading side, document title opposite, then a rule. */
export function drawDocumentHeading(
  pdf: PdfBuilder,
  style: DocumentStyle,
  params: { titleAr: string; titleEn: string; stamp?: string | null }
) {
  if (style.template === "modern") pdf.fill(0, 0, pdf.doc.page.width, 8, style.accent);
  const top = pdf.y;
  const sideWidth = 180;
  const mainWidth = pdf.width - sideWidth - 20;
  const mainX = pdf.boxX(0, mainWidth);
  const sideX = pdf.boxX(mainWidth + 20, sideWidth);

  let mainY = top;
  if (style.logo) {
    try {
      pdf.doc.image(style.logo, mainX + mainWidth - 130, mainY, { fit: [130, 46], align: "right" });
      mainY += 54;
    } catch {
      // An unsupported logo format must not stop the document.
    }
  }
  mainY += pdf.text(style.seller.name, mainX, mainY, mainWidth, { size: 14, bold: true });
  if (style.header?.trim()) {
    mainY += pdf.text(style.header.trim(), mainX, mainY, mainWidth, { size: 8.5, color: MUTED });
  }
  for (const row of [
    style.seller.address ?? "",
    style.seller.vatNumber ? `الرقم الضريبي VAT No: ${style.seller.vatNumber}` : "",
    style.seller.crNumber ? `السجل التجاري CR No: ${style.seller.crNumber}` : "",
  ].filter(Boolean)) {
    mainY += pdf.text(row, mainX, mainY + 1, mainWidth, { size: 8.5 });
  }

  let sideY = top;
  sideY += pdf.text(params.titleAr, sideX, sideY, sideWidth, {
    size: 15,
    bold: true,
    align: "end",
    color: style.accent,
  });
  sideY += pdf.text(params.titleEn, sideX, sideY, sideWidth, {
    size: 9.5,
    align: "end",
    color: MUTED,
    direction: "ltr",
  });
  if (params.stamp) {
    sideY += pdf.text(params.stamp, sideX, sideY + 6, sideWidth, {
      size: 10,
      bold: true,
      align: "end",
      color: "#b3372f",
    });
    sideY += 6;
  }

  const minimal = style.template === "minimal";
  pdf.y = Math.max(mainY, sideY) + 12;
  pdf.rule(minimal ? RULE : style.accent, minimal ? 0.7 : 1.4);
  pdf.y += 10;
}

/** Equal columns of label over value. */
export function drawFacts(pdf: PdfBuilder, facts: Array<[label: string, value: string]>) {
  const width = pdf.width / facts.length;
  let height = 0;
  facts.forEach(([label, value], index) => {
    const x = pdf.boxX(index * width, width);
    const labelHeight = pdf.text(label, x, pdf.y, width - 8, { size: 7.5, color: MUTED });
    const valueHeight = pdf.text(value, x, pdf.y + labelHeight, width - 8, { size: 10, bold: true });
    height = Math.max(height, labelHeight + valueHeight);
  });
  pdf.y += height + 10;
}

/** A named party with its details in a framed or shaded box. */
export function drawParty(
  pdf: PdfBuilder,
  style: DocumentStyle,
  label: string,
  party: TaxDocumentParty
) {
  const rows = [
    party.vatNumber ? `الرقم الضريبي VAT No: ${party.vatNumber}` : "",
    party.crNumber ? `السجل التجاري CR No: ${party.crNumber}` : "",
    party.address ?? "",
  ].filter(Boolean);
  const inner = pdf.width - 20;
  const height =
    pdf.heightOf("x", inner, { size: 7.5 }) +
    pdf.heightOf(party.name, inner, { size: 10.5, bold: true }) +
    rows.reduce((sum, row) => sum + pdf.heightOf(row, inner, { size: 8.5 }), 0) +
    16;
  pdf.ensure(height);
  if (style.template === "minimal") {
    pdf.doc.rect(pdf.margin, pdf.y, pdf.width, height).lineWidth(0.7).strokeColor(RULE).stroke();
  } else {
    pdf.fill(pdf.margin, pdf.y, pdf.width, height, WASH);
  }
  let y = pdf.y + 8;
  y += pdf.text(label, pdf.margin + 10, y, inner, { size: 7.5, color: MUTED });
  y += pdf.text(party.name, pdf.margin + 10, y, inner, { size: 10.5, bold: true });
  for (const row of rows) y += pdf.text(row, pdf.margin + 10, y, inner, { size: 8.5 });
  pdf.y += height + 12;
}

/** The amount written out in both languages; nothing for currencies without words. */
export function drawAmountInWords(pdf: PdfBuilder, amount: number, currency: string) {
  const arabic = amountInWords(amount, "ar", currency);
  const english = amountInWords(amount, "en", currency);
  if (!arabic || !english) return;
  pdf.ensure(34);
  pdf.paragraph(arabic, { size: 9.5, bold: true });
  pdf.paragraph(english, { size: 8.5, color: MUTED, direction: "ltr", align: "start" });
  pdf.y += 8;
}

/** Blank lines to sign on, side by side. */
export function drawSignatureLines(pdf: PdfBuilder, labels: string[]) {
  pdf.ensure(80);
  pdf.y += 34;
  const width = pdf.width / labels.length;
  let height = 0;
  labels.forEach((label, index) => {
    const x = pdf.boxX(index * width, width) + 12;
    pdf.doc
      .moveTo(x, pdf.y)
      .lineTo(x + width - 24, pdf.y)
      .lineWidth(0.7)
      .strokeColor(INK)
      .stroke();
    height = Math.max(
      height,
      pdf.text(label, x, pdf.y + 5, width - 24, { size: 8.5, color: MUTED, align: "center" })
    );
  });
  pdf.y += height + 10;
}
