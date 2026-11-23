/** Message key that names where a journal entry came from. */
const LEDGER_SOURCE_KEYS: Record<string, string> = {
  sales_invoice: "reports.ledger.source.salesInvoice",
  sales_invoice_cancel: "reports.ledger.source.salesInvoiceCancel",
  invoice_payment: "reports.ledger.source.invoicePayment",
  payment_receipt: "reports.ledger.source.paymentReceipt",
  purchase_bill: "reports.ledger.source.purchaseBill",
  purchase_bill_cancel: "reports.ledger.source.purchaseBillCancel",
  bill_payment: "reports.ledger.source.billPayment",
  vendor_payment: "reports.ledger.source.vendorPayment",
  vendor_credit_note: "reports.ledger.source.vendorCreditNote",
  sales_credit_note: "reports.ledger.source.salesCreditNote",
  sales_debit_note: "reports.ledger.source.salesDebitNote",
  credit_note_refund: "reports.ledger.source.creditNoteRefund",
  expense: "reports.ledger.source.expense",
  expense_reimbursement: "reports.ledger.source.expenseReimbursement",
  bank_transfer: "reports.ledger.source.bankTransfer",
  cash_adjustment: "reports.ledger.source.cashAdjustment",
  payroll_run: "reports.ledger.source.payrollRun",
  payroll_payment: "reports.ledger.source.payrollRun",
  opening_balance: "reports.ledger.source.openingBalance",
  manual: "reports.ledger.source.manual",
  manual_reversal: "reports.ledger.source.manualReversal",
};

export const ledgerSourceKey = (sourceType: string): string | null =>
  LEDGER_SOURCE_KEYS[sourceType] ?? null;
