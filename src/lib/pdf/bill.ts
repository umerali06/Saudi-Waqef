import { MUTED, RULE, WASH, INK } from "@/lib/pdf/builder";
import {
  bilingual,
  createDocument,
  documentMoney,
  drawAmountInWords,
  drawDocumentHeading,
  drawFacts,
  drawParty,
  drawSignatureLines,
  type DocumentStyle,
} from "@/lib/pdf/parts";
import type { TaxDocumentParty } from "@/lib/pdf/tax-document";
import { formatQuantity } from "@/lib/utils/units";

export type BillModel = {
  style: DocumentStyle;
  status: string;
  number: string;
  vendorNumber?: string | null;
  billDate: string;
  dueDate: string;
  vendor: TaxDocumentParty;
  currency: string;
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
  amountPaid: number;
  amountCredited: number;
  balance: number;
  notes?: string | null;
};

/** The company's own record of a vendor's bill. */
export async function renderBill(model: BillModel): Promise<Buffer> {
  const { style } = model;
  const pdf = createDocument(style, "Purchase bill", model.number);
  drawDocumentHeading(pdf, style, {
    titleAr: "فاتورة مشتريات",
    titleEn: "Purchase Bill",
    stamp:
      model.status === "draft"
        ? bilingual("مسودة", "Draft")
        : model.status === "canceled"
          ? bilingual("ملغاة", "Canceled")
          : null,
  });
  drawFacts(pdf, [
    [bilingual("رقم القيد", "Bill number"), model.number],
    [bilingual("رقم فاتورة المورد", "Vendor invoice"), model.vendorNumber || "-"],
    [bilingual("تاريخ الفاتورة", "Bill date"), model.billDate],
    [bilingual("تاريخ الاستحقاق", "Due date"), model.dueDate],
  ]);
  drawParty(pdf, style, "المورد  Vendor", model.vendor);

  const hasDiscount = model.lines.some((line) => line.discount > 0);
  const modern = style.template === "modern";
  const minimal = style.template === "minimal";
  pdf.table(
    [
      { header: "#", width: 4, align: "center" },
      { header: bilingual("الوصف", "Description"), width: hasDiscount ? 28 : 36 },
      { header: bilingual("الكمية", "Qty"), width: 10, align: "center" },
      { header: bilingual("سعر الوحدة", "Unit price"), width: 12, align: "end" },
      ...(hasDiscount
        ? [{ header: bilingual("الخصم", "Discount"), width: 10, align: "end" as const }]
        : []),
      { header: bilingual("قبل الضريبة", "Net"), width: 13, align: "end" },
      { header: bilingual("الضريبة", "VAT"), width: 13, align: "end" },
      { header: bilingual("الإجمالي", "Total"), width: 14, align: "end", bold: true },
    ],
    model.lines.map((line, index) => ({
      cells: [
        String(index + 1),
        line.description,
        formatQuantity(line.quantity, line.unit),
        documentMoney(line.unitPrice),
        ...(hasDiscount ? [documentMoney(line.discount)] : []),
        documentMoney(line.net),
        `${documentMoney(line.tax)}\n${line.taxPercent}%`,
        documentMoney(line.total),
      ],
    })),
    {
      size: 8.2,
      padding: 4,
      headerFill: modern ? style.accent : minimal ? "#ffffff" : WASH,
      headerColor: modern ? "#ffffff" : MUTED,
    }
  );
  pdf.y += 12;

  const totals: Array<{ label: string; value: string; strong?: boolean }> = [
    {
      label: "الإجمالي قبل الضريبة والخصم  Subtotal",
      value: documentMoney(model.subtotal + model.discountTotal),
    },
    ...(model.discountTotal > 0
      ? [{ label: "إجمالي الخصم  Discount", value: documentMoney(model.discountTotal) }]
      : []),
    { label: "ضريبة القيمة المضافة  VAT", value: documentMoney(model.taxTotal) },
    {
      label: "الإجمالي شامل الضريبة  Total incl. VAT",
      value: `${documentMoney(model.total)} ${model.currency}`,
      strong: true,
    },
    ...(model.amountPaid > 0
      ? [{ label: "المدفوع  Paid", value: documentMoney(model.amountPaid) }]
      : []),
    ...(model.amountCredited > 0
      ? [{ label: "إشعارات دائنة  Credited", value: documentMoney(model.amountCredited) }]
      : []),
    ...(model.amountPaid > 0 || model.amountCredited > 0
      ? [
          {
            label: "المتبقي  Balance due",
            value: `${documentMoney(model.balance)} ${model.currency}`,
            strong: true,
          },
        ]
      : []),
  ];
  const width = 290;
  const x = pdf.boxX(pdf.width - width, width);
  pdf.ensure(totals.length * 20 + 10);
  for (const row of totals) {
    const height = row.strong ? 24 : 18;
    const textStyle = { size: row.strong ? 10.5 : 9, bold: row.strong };
    if (row.strong && !minimal) pdf.fill(x, pdf.y, width, height, WASH);
    pdf.doc
      .moveTo(x, pdf.y)
      .lineTo(x + width, pdf.y)
      .lineWidth(row.strong ? 1 : 0.5)
      .strokeColor(row.strong ? INK : RULE)
      .stroke();
    const y = pdf.y + (row.strong ? 5 : 3);
    pdf.text(row.label, x + 90, y, width - 98, textStyle);
    pdf.text(row.value, x + 8, y, 110, { ...textStyle, align: "end", direction: "ltr" });
    pdf.y += height;
  }
  pdf.y += 12;
  drawAmountInWords(pdf, model.total, model.currency);

  if (model.notes?.trim()) {
    pdf.ensure(40);
    pdf.paragraph("ملاحظات  Notes", { size: 8, bold: true, color: MUTED });
    pdf.paragraph(model.notes.trim(), { size: 9 });
  }
  drawSignatureLines(pdf, [
    bilingual("أعدها", "Prepared by"),
    bilingual("راجعها", "Reviewed by"),
    bilingual("اعتمدها", "Approved by"),
  ]);
  return pdf.finish();
}
