import QRCode from "qrcode";
import { amountInWords } from "@/lib/utils/amount-in-words";
import { INK, MUTED, PdfBuilder, RULE, WASH } from "@/lib/pdf/builder";
import { printableUnit } from "@/lib/utils/units";

export type TaxDocumentParty = {
  name: string;
  vatNumber?: string | null;
  crNumber?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type TaxDocumentModel = {
  kind: "invoice" | "credit" | "debit";
  simplified: boolean;
  status: string;
  number: string;
  issueDate: string;
  issueTime: string;
  supplyDate: string;
  dueDate?: string | null;
  originalNumber?: string | null;
  reason?: string | null;
  currency: string;
  seller: TaxDocumentParty;
  buyer: TaxDocumentParty;
  lines: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    net: number;
    taxPercent: number;
    tax: number;
    total: number;
  }>;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid?: number;
  balance?: number;
  notes?: string | null;
  terms?: string | null;
  header?: string | null;
  footer?: string | null;
  signature?: { name: string; title: string; image?: Buffer | null } | null;
  accent: string;
  template: "classic" | "modern" | "minimal";
  logo?: Buffer | null;
  qr?: string | null;
  xml?: { name: string; content: Buffer } | null;
};

const TITLES = {
  invoice: [
    ["فاتورة ضريبية", "Tax Invoice"],
    ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice"],
  ],
  credit: [
    ["إشعار دائن للفاتورة الضريبية", "Tax Credit Note"],
    ["إشعار دائن للفاتورة الضريبية المبسطة", "Simplified Tax Credit Note"],
  ],
  debit: [
    ["إشعار مدين للفاتورة الضريبية", "Tax Debit Note"],
    ["إشعار مدين للفاتورة الضريبية المبسطة", "Simplified Tax Debit Note"],
  ],
} as const;

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);

export { printableUnit };

const bilingual = (arabic: string, english: string) => `${arabic}\n${english}`;

/** Saudi tax document, bilingual, right to left, with QR and (when filed) embedded XML. */
export async function renderTaxDocument(model: TaxDocumentModel): Promise<Buffer> {
  const [titleAr, titleEn] = TITLES[model.kind][model.simplified ? 1 : 0];
  const isDraft = model.status === "draft";
  const isCanceled = model.status === "canceled";
  const pdf = new PdfBuilder({
    direction: "rtl",
    title: `${titleEn} ${model.number}`,
    author: model.seller.name,
    archival: Boolean(model.xml),
    footer: ({ page, pages }) =>
      [model.footer?.trim(), model.number, `صفحة ${page} من ${pages}`].filter(Boolean).join("   |   "),
  });
  const { doc } = pdf;
  const accent = /^#[0-9a-f]{6}$/i.test(model.accent) ? model.accent : "#185fa5";
  const modern = model.template === "modern";
  const minimal = model.template === "minimal";

  // ---- Heading: seller on the reading side, title and QR opposite.
  if (modern) pdf.fill(0, 0, doc.page.width, 8, accent);
  const top = pdf.y;
  const sideWidth = 170;
  const mainWidth = pdf.width - sideWidth - 20;
  const mainX = pdf.boxX(0, mainWidth);
  const sideX = pdf.boxX(mainWidth + 20, sideWidth);
  let mainY = top;
  if (model.logo) {
    try {
      doc.image(model.logo, mainX + mainWidth - 130, mainY, { fit: [130, 46], align: "right" });
      mainY += 54;
    } catch {
      // An unsupported logo format must not stop the invoice.
    }
  }
  mainY += pdf.text(model.seller.name, mainX, mainY, mainWidth, { size: 14, bold: true });
  if (model.header?.trim()) {
    mainY += pdf.text(model.header.trim(), mainX, mainY, mainWidth, { size: 8.5, color: MUTED });
  }
  const sellerRows: string[] = [];
  if (model.seller.address) sellerRows.push(model.seller.address);
  if (model.seller.vatNumber) sellerRows.push(`الرقم الضريبي VAT No: ${model.seller.vatNumber}`);
  if (model.seller.crNumber) sellerRows.push(`السجل التجاري CR No: ${model.seller.crNumber}`);
  for (const row of sellerRows) {
    mainY += pdf.text(row, mainX, mainY + 1, mainWidth, { size: 8.5 });
  }

  let sideY = top;
  sideY += pdf.text(titleAr, sideX, sideY, sideWidth, { size: 14, bold: true, align: "end", color: accent });
  sideY += pdf.text(titleEn, sideX, sideY, sideWidth, { size: 9.5, align: "end", color: MUTED, direction: "ltr" });
  if (model.qr) {
    const qrImage = await QRCode.toBuffer(model.qr, { margin: 0, width: 420, errorCorrectionLevel: "M" });
    doc.image(qrImage, sideX, sideY + 6, { width: 92 });
    sideY += 104;
  } else if (isDraft || isCanceled) {
    sideY += pdf.text(
      isDraft ? "مسودة - ليست فاتورة ضريبية\nDraft - not a tax invoice" : "ملغاة\nCanceled",
      sideX,
      sideY + 8,
      sideWidth,
      { size: 10, bold: true, align: "end", color: "#b3372f" }
    );
    sideY += 10;
  }
  pdf.y = Math.max(mainY, sideY) + 12;
  pdf.rule(minimal ? RULE : accent, minimal ? 0.7 : 1.4);
  pdf.y += 10;

  // ---- Document facts.
  const facts: Array<[string, string]> = [
    [bilingual("رقم المستند", "Number"), model.number],
    [bilingual("تاريخ الإصدار", "Issue date"), `${model.issueDate}  ${model.issueTime.slice(0, 5)}`],
    [bilingual("تاريخ التوريد", "Supply date"), model.supplyDate],
  ];
  if (model.originalNumber) facts.push([bilingual("الفاتورة الأصلية", "Original invoice"), model.originalNumber]);
  else if (model.dueDate) facts.push([bilingual("تاريخ الاستحقاق", "Due date"), model.dueDate]);
  const factWidth = pdf.width / facts.length;
  let factHeight = 0;
  facts.forEach(([label, value], index) => {
    const x = pdf.boxX(index * factWidth, factWidth);
    const labelHeight = pdf.text(label, x, pdf.y, factWidth - 8, { size: 7.5, color: MUTED });
    const valueHeight = pdf.text(value, x, pdf.y + labelHeight, factWidth - 8, {
      size: 10,
      bold: true,
      direction: "ltr",
    });
    factHeight = Math.max(factHeight, labelHeight + valueHeight);
  });
  pdf.y += factHeight + 10;

  // ---- Buyer.
  const buyerRows: string[] = [];
  if (model.buyer.vatNumber) buyerRows.push(`الرقم الضريبي VAT No: ${model.buyer.vatNumber}`);
  if (model.buyer.crNumber) buyerRows.push(`السجل التجاري CR No: ${model.buyer.crNumber}`);
  if (model.buyer.address) buyerRows.push(model.buyer.address);
  const buyerInner = pdf.width - 20;
  const buyerHeight =
    pdf.heightOf("x", buyerInner, { size: 7.5 }) +
    pdf.heightOf(model.buyer.name, buyerInner, { size: 10.5, bold: true }) +
    buyerRows.reduce((sum, row) => sum + pdf.heightOf(row, buyerInner, { size: 8.5 }), 0) +
    16;
  if (minimal) doc.rect(pdf.margin, pdf.y, pdf.width, buyerHeight).lineWidth(0.7).strokeColor(RULE).stroke();
  else pdf.fill(pdf.margin, pdf.y, pdf.width, buyerHeight, WASH);
  let buyerY = pdf.y + 8;
  buyerY += pdf.text("العميل  Customer", pdf.margin + 10, buyerY, buyerInner, { size: 7.5, color: MUTED });
  buyerY += pdf.text(model.buyer.name, pdf.margin + 10, buyerY, buyerInner, { size: 10.5, bold: true });
  for (const row of buyerRows) buyerY += pdf.text(row, pdf.margin + 10, buyerY, buyerInner, { size: 8.5 });
  pdf.y += buyerHeight + 12;

  // ---- Lines.
  const hasDiscount = model.lines.some((line) => line.discount > 0);
  pdf.table(
    [
      { header: "#", width: 4, align: "center" },
      { header: bilingual("الوصف", "Description"), width: hasDiscount ? 27 : 34 },
      { header: bilingual("الكمية", "Qty"), width: 9, align: "center" },
      { header: bilingual("سعر الوحدة", "Unit price"), width: 12, align: "end" },
      ...(hasDiscount ? [{ header: bilingual("الخصم", "Discount"), width: 10, align: "end" as const }] : []),
      { header: bilingual("الخاضع للضريبة", "Taxable"), width: 13, align: "end" },
      { header: bilingual("الضريبة", "VAT"), width: 8, align: "center" },
      { header: bilingual("مبلغ الضريبة", "VAT amount"), width: 12, align: "end" },
      { header: bilingual("الإجمالي", "Total"), width: 13, align: "end", bold: true },
    ],
    model.lines.map((line, index) => ({
      cells: [
        String(index + 1),
        line.description,
        [quantity(line.quantity), printableUnit(line.unit)].filter(Boolean).join(" "),
        money(line.unitPrice),
        ...(hasDiscount ? [money(line.discount)] : []),
        money(line.net),
        `${quantity(line.taxPercent)}%`,
        money(line.tax),
        money(line.total),
      ],
    })),
    {
      size: 8.2,
      padding: 4,
      headerFill: modern ? accent : minimal ? "#ffffff" : WASH,
      headerColor: modern ? "#ffffff" : MUTED,
    }
  );
  pdf.y += 12;

  // ---- Totals.
  const totals: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "الإجمالي قبل الضريبة والخصم  Subtotal", value: money(model.subtotal + model.discountTotal) },
    ...(model.discountTotal > 0 ? [{ label: "إجمالي الخصم  Discount", value: money(model.discountTotal) }] : []),
    { label: "الإجمالي الخاضع للضريبة  Taxable amount", value: money(model.subtotal) },
    { label: "ضريبة القيمة المضافة  VAT", value: money(model.taxTotal) },
    { label: "الإجمالي شامل الضريبة  Total incl. VAT", value: `${money(model.total)} ${model.currency}`, strong: true },
    ...(model.amountPaid && model.amountPaid > 0
      ? [
          { label: "المدفوع  Paid", value: money(model.amountPaid) },
          { label: "المتبقي  Balance due", value: `${money(model.balance ?? 0)} ${model.currency}`, strong: true },
        ]
      : []),
  ];
  const totalsWidth = 290;
  pdf.ensure(totals.length * 20 + 10);
  const totalsX = pdf.boxX(pdf.width - totalsWidth, totalsWidth);
  for (const row of totals) {
    const style = { size: row.strong ? 10.5 : 9, bold: row.strong };
    const height = row.strong ? 24 : 18;
    if (row.strong) pdf.fill(totalsX, pdf.y, totalsWidth, height, minimal ? "#ffffff" : WASH);
    doc.moveTo(totalsX, pdf.y).lineTo(totalsX + totalsWidth, pdf.y).lineWidth(row.strong ? 1 : 0.5).strokeColor(row.strong ? INK : RULE).stroke();
    const textY = pdf.y + (row.strong ? 5 : 3);
    pdf.text(row.label, totalsX + 90, textY, totalsWidth - 98, style);
    pdf.text(row.value, totalsX + 8, textY, 110, { ...style, align: "end", direction: "ltr" });
    pdf.y += height;
  }
  pdf.y += 14;

  const words = amountInWords(model.total, "ar", model.currency);
  if (words) {
    pdf.ensure(24);
    pdf.paragraph(words, { size: 9, bold: true });
    pdf.y += 10;
  }

  // ---- Reason, notes, terms, signature.
  const block = (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    pdf.ensure(40);
    pdf.paragraph(label, { size: 8, bold: true, color: MUTED });
    pdf.paragraph(value.trim(), { size: 9 });
    pdf.y += 8;
  };
  block("سبب الإشعار  Reason", model.reason);
  block("ملاحظات  Notes", model.notes);
  block("الشروط والأحكام  Terms", model.terms);
  if (model.signature?.name || model.signature?.image) {
    pdf.ensure(80);
    const x = pdf.boxX(pdf.width - 180, 180);
    if (model.signature.image) {
      try {
        doc.image(model.signature.image, x, pdf.y, { fit: [120, 46] });
        pdf.y += 50;
      } catch {
        // Unsupported image format: the printed name still identifies the signatory.
      }
    }
    pdf.text(model.signature.name, x, pdf.y, 180, { size: 9.5, bold: true, align: "end" });
    pdf.text(model.signature.title, x, pdf.y + 14, 180, { size: 8.5, color: MUTED, align: "end" });
    pdf.y += 34;
  }

  if (model.xml) {
    doc.file(model.xml.content, {
      name: model.xml.name,
      type: "text/xml",
      relationship: "Alternative",
      description: "ZATCA e-invoice",
      creationDate: new Date(),
      modifiedDate: new Date(),
    } as Parameters<typeof doc.file>[1]);
  }
  return pdf.finish();
}
