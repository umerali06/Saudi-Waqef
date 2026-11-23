import { MUTED, RULE, WASH } from "@/lib/pdf/builder";
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

export type VoucherModel = {
  kind: "receipt" | "payment";
  style: DocumentStyle;
  number: string;
  date: string;
  party: TaxDocumentParty;
  currency: string;
  amount: number;
  unappliedAmount: number;
  methodAr: string;
  methodEn: string;
  accountName: string;
  reference?: string | null;
  allocations: Array<{ number: string; amount: number }>;
};

const TEXT = {
  receipt: {
    titleAr: "سند قبض",
    titleEn: "Receipt Voucher",
    party: "استلمنا من  Received from",
    account: bilingual("أودع في", "Deposited to"),
    document: bilingual("رقم الفاتورة", "Invoice"),
    signatures: [bilingual("المستلم", "Received by"), bilingual("المحاسب", "Accountant"), bilingual("المدير", "Manager")],
  },
  payment: {
    titleAr: "سند صرف",
    titleEn: "Payment Voucher",
    party: "اصرفوا إلى  Paid to",
    account: bilingual("صرف من", "Paid from"),
    document: bilingual("رقم فاتورة المورد", "Bill"),
    signatures: [bilingual("المستلم", "Received by"), bilingual("المحاسب", "Accountant"), bilingual("المدير", "Approved by")],
  },
} as const;

/** Bilingual receipt (سند قبض) or payment (سند صرف) voucher. */
export async function renderVoucher(model: VoucherModel): Promise<Buffer> {
  const text = TEXT[model.kind];
  const pdf = createDocument(model.style, text.titleEn, model.number);
  drawDocumentHeading(pdf, model.style, text);
  drawFacts(pdf, [
    [bilingual("رقم السند", "Voucher number"), model.number],
    [bilingual("التاريخ", "Date"), model.date],
    [bilingual("طريقة الدفع", "Method"), bilingual(model.methodAr, model.methodEn)],
    [text.account, model.accountName || "-"],
    ...(model.reference
      ? [[bilingual("المرجع", "Reference"), model.reference] as [string, string]]
      : []),
  ]);
  drawParty(pdf, model.style, text.party, model.party);

  // The amount, large enough to read at a glance.
  const height = 40;
  pdf.ensure(height + 10);
  if (model.style.template === "minimal") {
    pdf.doc.rect(pdf.margin, pdf.y, pdf.width, height).lineWidth(0.7).strokeColor(RULE).stroke();
  } else {
    pdf.fill(pdf.margin, pdf.y, pdf.width, height, WASH);
  }
  const half = pdf.width / 2;
  pdf.text("المبلغ  Amount", pdf.boxX(10, half), pdf.y + 13, half, { size: 9.5, color: MUTED });
  pdf.text(
    `${documentMoney(model.amount)} ${model.currency}`,
    pdf.boxX(half, half - 10),
    pdf.y + 9,
    half - 10,
    { size: 16, bold: true, align: "end", direction: "ltr", color: model.style.accent }
  );
  pdf.y += height + 10;
  drawAmountInWords(pdf, model.amount, model.currency);

  if (model.allocations.length > 0) {
    pdf.y += 4;
    pdf.table(
      [
        { header: "#", width: 8, align: "center" },
        { header: text.document, width: 60 },
        { header: bilingual("المبلغ المسدد", "Amount applied"), width: 32, align: "end" },
      ],
      [
        ...model.allocations.map((allocation, index) => ({
          cells: [String(index + 1), allocation.number, documentMoney(allocation.amount)],
        })),
        ...(model.unappliedAmount > 0
          ? [
              {
                cells: ["", "دفعة على الحساب  On account", documentMoney(model.unappliedAmount)],
                bold: true,
              },
            ]
          : []),
      ],
      { size: 9 }
    );
  }
  drawSignatureLines(pdf, [...text.signatures]);
  return pdf.finish();
}
