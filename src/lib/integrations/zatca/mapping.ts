import crypto from "crypto";
import type { SalesInvoice } from "@/lib/data/sales-invoices";
import type { CompanyRecord } from "@/lib/data/companies";
import type { CustomerRecord } from "@/lib/data/customers";

export type ZatcaDraft = {
  uuid: string;
  issueDate: string;
  issueTime: string;
  invoiceNumber: string;
  currency: string;
  seller: {
    name: string;
    vatNumber?: string;
    crNumber?: string;
    address?: string;
  };
  buyer: {
    name: string;
    vatNumber?: string;
    crNumber?: string;
    address?: string;
  };
  totals: {
    subtotal: number;
    taxTotal: number;
    total: number;
  };
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  hash: string;
  qr: string;
};

const formatIsoTime = (dateValue?: string) => {
  if (!dateValue) {
    return "00:00:00Z";
  }
  return `${dateValue}T00:00:00Z`;
};

const hashPayload = (payload: Record<string, unknown>) =>
  crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const buildQrPayload = (params: {
  sellerName: string;
  vatNumber?: string;
  timestamp: string;
  total: number;
  taxTotal: number;
}) => {
  const raw = [
    params.sellerName,
    params.vatNumber ?? "",
    params.timestamp,
    params.total.toFixed(2),
    params.taxTotal.toFixed(2),
  ].join("|");
  return Buffer.from(raw).toString("base64");
};

export function mapInvoiceToZatcaDraft(params: {
  uuid: string;
  invoice: SalesInvoice;
  company: CompanyRecord;
  customer?: CustomerRecord | null;
}) {
  const { invoice, company, customer } = params;
  const issueDate = invoice.invoiceDate;
  const issueTime = formatIsoTime(invoice.invoiceDate);

  const draftPayload = {
    uuid: params.uuid,
    issueDate,
    issueTime,
    invoiceNumber: invoice.invoiceNumber,
    currency: invoice.currency ?? company.currency ?? "SAR",
    seller: {
      name: company.legalName ?? company.name,
      vatNumber: company.vatNumber ?? undefined,
      crNumber: company.crNumber ?? undefined,
      address: company.address ?? undefined,
    },
    buyer: {
      name: customer?.legalName ?? customer?.name ?? invoice.customerName ?? "Customer",
      vatNumber: customer?.vatNumber ?? undefined,
      crNumber: customer?.crNumber ?? undefined,
      address: customer?.billingAddress ?? undefined,
    },
    totals: {
      subtotal: invoice.subtotal ?? 0,
      taxTotal: invoice.taxTotal ?? 0,
      total: invoice.total ?? 0,
    },
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.totalAmount,
    })),
  };

  const hash = hashPayload(draftPayload);
  const qr = buildQrPayload({
    sellerName: company.legalName ?? company.name,
    vatNumber: company.vatNumber,
    timestamp: issueTime,
    total: invoice.total ?? 0,
    taxTotal: invoice.taxTotal ?? 0,
  });

  return {
    ...draftPayload,
    hash,
    qr,
  } as ZatcaDraft;
}
