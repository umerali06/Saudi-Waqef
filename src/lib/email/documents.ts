import type { OutboxEmail } from "@/lib/data/email-outbox";
import type { PartyType } from "@/lib/data/open-items";
import { buildStatementPdf } from "@/lib/pdf/statement";
import { buildTaxDocumentPdf, type TaxDocumentKind } from "@/lib/pdf/tax-document-data";
import type { TaxDocumentParty } from "@/lib/pdf/tax-document";
import { renderEmail, type EmailLocale } from "@/lib/email/template";

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

const TAX_DOCUMENT_SOURCES: Record<string, TaxDocumentKind> = {
  sales_invoice: "invoice",
  credit_note: "credit",
  debit_note: "debit",
};

const STATEMENT_PARTIES: Record<string, PartyType> = {
  customer_statement: "customer",
  vendor_statement: "vendor",
};

/** Mail that is worthless without its document, so it is sent while the user waits. */
export const DOCUMENT_SOURCES = new Set([
  ...Object.keys(TAX_DOCUMENT_SOURCES),
  ...Object.keys(STATEMENT_PARTIES),
]);

/**
 * Files for an outbox email, produced at the moment of sending: a retry then
 * carries the document as it stands, and no binary sits in the database. Throws
 * rather than sending "your invoice is attached" with nothing attached.
 */
export async function buildEmailAttachments(email: OutboxEmail): Promise<EmailAttachment[]> {
  const kind = TAX_DOCUMENT_SOURCES[email.sourceType ?? ""];
  if (kind && email.sourceId) {
    const document = await buildTaxDocumentPdf(kind, email.sourceId);
    if (!document || document.source.companyId !== email.companyId) {
      throw new Error("The document to attach was not found.");
    }
    return [
      { filename: document.fileName, content: document.pdf, contentType: "application/pdf" },
      ...(document.xml
        ? [{ filename: document.xml.name, content: document.xml.content, contentType: "application/xml" }]
        : []),
    ];
  }
  const partyType = STATEMENT_PARTIES[email.sourceType ?? ""];
  if (partyType && email.sourceId) {
    const statement = await buildStatementPdf({
      partyType,
      partyId: email.sourceId,
      from: email.meta?.from,
      to: email.meta?.to,
      locale: email.meta?.locale,
    });
    if (!statement || statement.companyId !== email.companyId) {
      throw new Error("The statement to attach was not found.");
    }
    return [
      { filename: statement.fileName, content: statement.pdf, contentType: "application/pdf" },
    ];
  }
  return [];
}

const money = (value: number, currency: string) =>
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;

const LABELS = {
  ar: {
    invoice: "فاتورة",
    credit: "إشعار دائن",
    debit: "إشعار مدين",
    number: "الرقم",
    date: "تاريخ الإصدار",
    due: "تاريخ الاستحقاق",
    total: "الإجمالي شامل الضريبة",
    balance: "المتبقي",
    attached: "تجدون المستند مرفقًا بصيغة PDF.",
    vat: "الرقم الضريبي",
  },
  en: {
    invoice: "Invoice",
    credit: "Credit note",
    debit: "Debit note",
    number: "Number",
    date: "Issue date",
    due: "Due date",
    total: "Total including VAT",
    balance: "Balance due",
    attached: "The document is attached as a PDF.",
    vat: "VAT number",
  },
} as const;

/** Message body for a tax document: the sender's own words, then the key facts. */
export function renderDocumentEmail(params: {
  kind: TaxDocumentKind;
  locale: EmailLocale;
  message?: string;
  number: string;
  issueDate: string;
  dueDate?: string | null;
  total: number;
  balance?: number;
  currency: string;
  seller: Pick<TaxDocumentParty, "name" | "vatNumber">;
}) {
  const labels = LABELS[params.locale];
  return renderEmail({
    locale: params.locale,
    heading: `${labels[params.kind]} ${params.number}`,
    paragraphs: [...(params.message?.trim() ? params.message.trim().split(/\n+/) : []), labels.attached],
    details: [
      [labels.number, params.number],
      [labels.date, params.issueDate],
      ...(params.dueDate ? [[labels.due, params.dueDate] as [string, string]] : []),
      [labels.total, money(params.total, params.currency)],
      ...(params.balance !== undefined && params.balance > 0 && params.balance !== params.total
        ? [[labels.balance, money(params.balance, params.currency)] as [string, string]]
        : []),
    ],
    companyName: params.seller.name,
    footer: params.seller.vatNumber ? `${labels.vat}: ${params.seller.vatNumber}` : undefined,
  });
}
