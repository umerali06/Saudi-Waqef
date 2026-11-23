import type { Locale } from "@/i18n/messages";
import { listBillPaymentsByCompany } from "@/lib/data/bill-payments";
import { getCompanyById } from "@/lib/data/companies";
import { listCreditNoteRefundsByCompany } from "@/lib/data/credit-note-refunds";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { getCustomerById } from "@/lib/data/customers";
import { listSalesDebitNotes } from "@/lib/data/debit-notes";
import { listInvoicePaymentsByCompany } from "@/lib/data/invoice-payments";
import { computeAging, listOpenItems, type PartyType } from "@/lib/data/open-items";
import { listPaymentReceipts } from "@/lib/data/payment-receipts";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { listVendorPayments } from "@/lib/data/vendor-payments";
import { getVendorById } from "@/lib/data/vendors";
import { inlineDate, reportAmount, reportPeriod, renderReport, translator } from "@/lib/pdf/report";
import { sellerOf } from "@/lib/pdf/tax-document-data";
import { riyadhDate } from "@/lib/utils/riyadh";
import { buildStatement, statementPeriod, type StatementEntry } from "@/lib/utils/statement";

const isPosted = (document: { status: string }) =>
  document.status !== "draft" && document.status !== "canceled";

async function customerEntries(companyId: string, customerId: string): Promise<StatementEntry[]> {
  const [invoices, creditNotes, debitNotes, receipts, payments, refunds] = await Promise.all([
    listSalesInvoices(companyId),
    listSalesCreditNotes(companyId),
    listSalesDebitNotes(companyId),
    listPaymentReceipts(companyId),
    listInvoicePaymentsByCompany(companyId),
    listCreditNoteRefundsByCompany(companyId),
  ]);
  const ownInvoices = new Map(
    invoices
      .filter((invoice) => invoice.customerId === customerId && isPosted(invoice))
      .map((invoice) => [invoice.id, invoice])
  );
  const ownNotes = new Map(
    creditNotes
      .filter((note) => note.customerId === customerId && note.status === "issued")
      .map((note) => [note.id, note])
  );
  // Payments made through a receipt share its journal entry; the receipt is listed instead.
  const receiptEntries = new Set(receipts.map((receipt) => receipt.journalEntryId));

  return [
    ...[...ownInvoices.values()].map((invoice) => ({
      date: invoice.invoiceDate,
      typeKey: "statement.type.invoice",
      number: invoice.invoiceNumber,
      debit: invoice.total,
      credit: 0,
    })),
    ...debitNotes
      .filter((note) => note.customerId === customerId && note.status === "issued")
      .map((note) => ({
        date: note.issueDate,
        typeKey: "statement.type.debitNote",
        number: note.debitNumber,
        debit: note.total,
        credit: 0,
      })),
    ...[...ownNotes.values()].map((note) => ({
      date: note.issueDate,
      typeKey: "statement.type.creditNote",
      number: note.creditNumber,
      debit: 0,
      credit: note.total,
    })),
    ...receipts
      .filter((receipt) => receipt.customerId === customerId)
      .map((receipt) => ({
        date: receipt.receiptDate,
        typeKey: "statement.type.receipt",
        number: receipt.receiptNumber,
        debit: 0,
        credit: receipt.totalAmount,
      })),
    ...payments
      .filter(
        (payment) =>
          ownInvoices.has(payment.invoiceId) && !receiptEntries.has(payment.journalEntryId)
      )
      .map((payment) => ({
        date: payment.paymentDate,
        typeKey: "statement.type.payment",
        number: ownInvoices.get(payment.invoiceId)!.invoiceNumber,
        debit: 0,
        credit: payment.amount,
      })),
    ...refunds
      .filter((refund) => ownNotes.has(refund.creditNoteId))
      .map((refund) => ({
        date: refund.refundDate,
        typeKey: "statement.type.refund",
        number: ownNotes.get(refund.creditNoteId)!.creditNumber,
        debit: refund.amount,
        credit: 0,
      })),
  ];
}

async function vendorEntries(companyId: string, vendorId: string): Promise<StatementEntry[]> {
  const [bills, creditNotes, vendorPayments, payments] = await Promise.all([
    listPurchaseBills(companyId),
    listVendorCreditNotes(companyId),
    listVendorPayments(companyId),
    listBillPaymentsByCompany(companyId),
  ]);
  const ownBills = new Map(
    bills
      .filter((bill) => bill.vendorId === vendorId && isPosted(bill))
      .map((bill) => [bill.id, bill])
  );
  const paymentEntries = new Set(vendorPayments.map((payment) => payment.journalEntryId));

  return [
    ...[...ownBills.values()].map((bill) => ({
      date: bill.billDate,
      typeKey: "statement.type.bill",
      number: [bill.billNumber, bill.vendorBillNumber].filter(Boolean).join(" / "),
      debit: 0,
      credit: bill.total,
    })),
    ...creditNotes
      .filter((note) => note.vendorId === vendorId && note.status === "issued")
      .map((note) => ({
        date: note.issueDate,
        typeKey: "statement.type.creditNote",
        number: note.creditNumber,
        debit: note.total,
        credit: 0,
      })),
    ...vendorPayments
      .filter((payment) => payment.vendorId === vendorId)
      .map((payment) => ({
        date: payment.paymentDate,
        typeKey: "statement.type.vendorPayment",
        number: payment.paymentNumber,
        debit: payment.totalAmount,
        credit: 0,
      })),
    ...payments
      .filter(
        (payment) => ownBills.has(payment.billId) && !paymentEntries.has(payment.journalEntryId)
      )
      .map((payment) => ({
        date: payment.paymentDate,
        typeKey: "statement.type.payment",
        number: ownBills.get(payment.billId)!.billNumber,
        debit: payment.amount,
        credit: 0,
      })),
  ];
}

export type StatementRequest = {
  partyType: PartyType;
  partyId: string;
  from?: unknown;
  to?: unknown;
  locale?: unknown;
};

/** Party, period and figures of a statement, shared by the PDF and its email. */
export async function loadStatement(request: StatementRequest) {
  const party =
    request.partyType === "customer"
      ? await getCustomerById(request.partyId)
      : await getVendorById(request.partyId);
  if (!party) {
    return null;
  }
  const company = await getCompanyById(party.companyId);
  if (!company) {
    return null;
  }
  const today = riyadhDate();
  const period = statementPeriod(request.from, request.to, today);
  const locale: Locale =
    request.locale === "ar" || request.locale === "en"
      ? request.locale
      : company.defaultLanguage ?? "ar";
  const [entries, openItems, seller] = await Promise.all([
    request.partyType === "customer"
      ? customerEntries(company.id, party.id)
      : vendorEntries(company.id, party.id),
    listOpenItems(company.id, request.partyType, party.id),
    sellerOf(company),
  ]);
  return {
    party,
    company,
    seller,
    period,
    locale,
    currency: party.currency || "SAR",
    statement: buildStatement(entries, period, request.partyType),
    aging: computeAging(openItems, new Date(`${today}T00:00:00Z`)),
    today,
  };
}

export async function buildStatementPdf(request: StatementRequest) {
  const data = await loadStatement(request);
  if (!data) {
    return null;
  }
  const { party, seller, period, locale, currency, statement, aging, today } = data;
  const t = translator(locale);
  const partyDetails = [
    party.legalName || party.name,
    party.vatNumber ? `${t("reports.pdf.vatNumber")}: ${party.vatNumber}` : "",
    party.crNumber ? `${t("reports.pdf.crNumber")}: ${party.crNumber}` : "",
  ].filter(Boolean);

  const pdf = await renderReport({
    locale,
    company: seller,
    title: t(
      request.partyType === "customer" ? "statement.customerTitle" : "statement.vendorTitle"
    ),
    subtitle: [...partyDetails, reportPeriod(locale, period.from, period.to)].join("\n"),
    summary: [
      [t("statement.openingBalance"), `${reportAmount(statement.openingBalance)} ${currency}`],
      [t("statement.totalDebit"), reportAmount(statement.totalDebit)],
      [t("statement.totalCredit"), reportAmount(statement.totalCredit)],
      [t("statement.closingBalance"), `${reportAmount(statement.closingBalance)} ${currency}`],
    ],
    tables: [
      {
        columns: [
          { header: t("statement.date"), width: 14 },
          { header: t("statement.document"), width: 22 },
          { header: t("statement.number"), width: 24 },
          { header: t("statement.debit"), width: 15, align: "right" },
          { header: t("statement.credit"), width: 15, align: "right" },
          { header: t("statement.balance"), width: 17, align: "right", bold: true },
        ],
        rows: [
          {
            cells: [
              period.from,
              t("statement.openingBalance"),
              "",
              "",
              "",
              reportAmount(statement.openingBalance),
            ],
          },
          ...statement.lines.map((line) => ({
            cells: [
              line.date,
              t(line.typeKey),
              line.number,
              line.debit ? reportAmount(line.debit) : "",
              line.credit ? reportAmount(line.credit) : "",
              reportAmount(line.balance),
            ],
          })),
          {
            cells: [
              period.to,
              t("statement.closingBalance"),
              "",
              reportAmount(statement.totalDebit),
              reportAmount(statement.totalCredit),
              reportAmount(statement.closingBalance),
            ],
            kind: "total" as const,
          },
        ],
      },
      {
        heading: `${t("statement.agingTitle")} ${inlineDate(locale, today)}`,
        columns: [
          { header: t("statement.aging.current"), width: 1, align: "right" },
          { header: t("statement.aging.days1to30"), width: 1, align: "right" },
          { header: t("statement.aging.days31to60"), width: 1, align: "right" },
          { header: t("statement.aging.days61to90"), width: 1, align: "right" },
          { header: t("statement.aging.days90plus"), width: 1, align: "right" },
          { header: t("statement.aging.total"), width: 1, align: "right", bold: true },
        ],
        rows: [
          {
            cells: [
              aging.current,
              aging.days1to30,
              aging.days31to60,
              aging.days61to90,
              aging.days90plus,
              aging.total,
            ].map(reportAmount),
          },
        ],
      },
    ],
    notes: [t("statement.balanceNote." + request.partyType)],
  });

  return {
    pdf,
    companyId: party.companyId,
    fileName: `statement-${party.name}-${period.from}-${period.to}.pdf`.replace(/[\\/:*?"<>|]+/g, "-"),
  };
}
