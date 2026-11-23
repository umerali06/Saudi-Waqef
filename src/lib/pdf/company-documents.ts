import { messages } from "@/i18n/messages";
import { listAccountingPaymentMethods } from "@/lib/data/accounting-payment-methods";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import { getCompanyById } from "@/lib/data/companies";
import { getCompanyConfig } from "@/lib/data/company-config";
import { getCustomerById } from "@/lib/data/customers";
import { getDocumentBranding } from "@/lib/data/document-branding";
import { getPaymentReceiptById } from "@/lib/data/payment-receipts";
import { getPurchaseBillById } from "@/lib/data/purchase-bills";
import { getVendorPaymentById } from "@/lib/data/vendor-payments";
import { getVendorById } from "@/lib/data/vendors";
import { renderBill } from "@/lib/pdf/bill";
import type { DocumentStyle, DocumentTemplate } from "@/lib/pdf/parts";
import { loadImage, sellerOf } from "@/lib/pdf/tax-document-data";
import { renderVoucher } from "@/lib/pdf/voucher";
import { formatDocumentDate } from "@/lib/utils/document-date";

const pdfFileName = (number: string) => `${number.replace(/[^\w.-]+/g, "-")}.pdf`;

/** Letterhead and formats of a company's own documents. */
async function loadLetterhead(companyId: string, template: "invoiceTemplate" | "billTemplate") {
  const company = await getCompanyById(companyId);
  if (!company) {
    return null;
  }
  const [seller, branding, config] = await Promise.all([
    sellerOf(company),
    getDocumentBranding(companyId),
    getCompanyConfig(companyId),
  ]);
  const style: DocumentStyle = {
    seller,
    header: branding.header,
    footer: branding.footer,
    logo: await loadImage(branding.logoUrl),
    accent: /^#[0-9a-f]{6}$/i.test(branding.accentColor ?? "")
      ? (branding.accentColor as string)
      : "#185fa5",
    template: config[template] as DocumentTemplate,
  };
  return {
    style,
    formatDate: (value: string) => formatDocumentDate(value, config.dateFormat),
  };
}

async function accountNameOf(companyId: string, accountId: string) {
  const [cashAccounts, accounts] = await Promise.all([
    listCashBankAccounts(companyId),
    listChartAccounts(companyId),
  ]);
  return (
    cashAccounts.find((account) => account.accountId === accountId)?.name ??
    accounts.find((account) => account.id === accountId)?.name ??
    ""
  );
}

async function methodNames(companyId: string, code: string) {
  const key = `payment.method.${code}`;
  if (messages.ar[key] && messages.en[key]) {
    return { methodAr: messages.ar[key], methodEn: messages.en[key] };
  }
  const methods = await listAccountingPaymentMethods(companyId);
  const name = methods.find((method) => method.code === code)?.name ?? code;
  return { methodAr: name, methodEn: "" };
}

export async function buildReceiptPdf(receiptId: string) {
  const receipt = await getPaymentReceiptById(receiptId);
  if (!receipt) {
    return null;
  }
  const [letterhead, customer, accountName, method] = await Promise.all([
    loadLetterhead(receipt.companyId, "invoiceTemplate"),
    getCustomerById(receipt.customerId),
    accountNameOf(receipt.companyId, receipt.accountId),
    methodNames(receipt.companyId, receipt.method),
  ]);
  if (!letterhead) {
    return null;
  }
  const pdf = await renderVoucher({
    kind: "receipt",
    style: letterhead.style,
    number: receipt.receiptNumber,
    date: letterhead.formatDate(receipt.receiptDate),
    party: {
      name: customer?.legalName || receipt.customerName,
      vatNumber: customer?.vatNumber ?? null,
      crNumber: customer?.crNumber ?? null,
    },
    currency: receipt.currency,
    amount: receipt.totalAmount,
    unappliedAmount: receipt.unappliedAmount,
    ...method,
    accountName,
    reference: receipt.reference,
    allocations: receipt.allocations.map((allocation) => ({
      number: allocation.invoiceNumber,
      amount: allocation.amount,
    })),
  });
  return { pdf, companyId: receipt.companyId, fileName: pdfFileName(receipt.receiptNumber) };
}

export async function buildVendorPaymentPdf(paymentId: string) {
  const payment = await getVendorPaymentById(paymentId);
  if (!payment) {
    return null;
  }
  const [letterhead, vendor, accountName, method] = await Promise.all([
    loadLetterhead(payment.companyId, "billTemplate"),
    getVendorById(payment.vendorId),
    accountNameOf(payment.companyId, payment.accountId),
    methodNames(payment.companyId, payment.method),
  ]);
  if (!letterhead) {
    return null;
  }
  const pdf = await renderVoucher({
    kind: "payment",
    style: letterhead.style,
    number: payment.paymentNumber,
    date: letterhead.formatDate(payment.paymentDate),
    party: {
      name: vendor?.legalName || payment.vendorName,
      vatNumber: vendor?.vatNumber ?? null,
      crNumber: vendor?.crNumber ?? null,
    },
    currency: payment.currency,
    amount: payment.totalAmount,
    unappliedAmount: payment.unappliedAmount,
    ...method,
    accountName,
    reference: payment.reference,
    allocations: payment.allocations.map((allocation) => ({
      number: allocation.billNumber,
      amount: allocation.amount,
    })),
  });
  return { pdf, companyId: payment.companyId, fileName: pdfFileName(payment.paymentNumber) };
}

export async function buildBillPdf(billId: string) {
  const bill = await getPurchaseBillById(billId);
  if (!bill) {
    return null;
  }
  const [letterhead, vendor] = await Promise.all([
    loadLetterhead(bill.companyId, "billTemplate"),
    getVendorById(bill.vendorId),
  ]);
  if (!letterhead) {
    return null;
  }
  const pdf = await renderBill({
    style: letterhead.style,
    status: bill.status,
    number: bill.billNumber,
    vendorNumber: bill.vendorBillNumber,
    billDate: letterhead.formatDate(bill.billDate),
    dueDate: letterhead.formatDate(bill.dueDate),
    vendor: {
      name: vendor?.legalName || bill.vendorName,
      vatNumber: vendor?.vatNumber ?? bill.vendorVatNumber ?? null,
      crNumber: vendor?.crNumber ?? null,
      address: bill.remittanceAddress ?? vendor?.remittanceAddress ?? null,
    },
    currency: bill.currency,
    lines: bill.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      discount: line.discountAmount,
      net: line.netAmount,
      taxPercent: Math.round(line.taxRate * 10000) / 100,
      tax: line.taxAmount,
      total: line.totalAmount,
    })),
    subtotal: bill.subtotal,
    discountTotal: bill.discountTotal,
    taxTotal: bill.taxTotal,
    total: bill.total,
    amountPaid: bill.amountPaid,
    amountCredited: bill.amountCredited,
    balance: bill.balance,
    notes: bill.notes,
  });
  return { pdf, companyId: bill.companyId, fileName: pdfFileName(bill.billNumber) };
}
