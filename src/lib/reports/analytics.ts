import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listExpenses } from "@/lib/data/expenses";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { listSalesDebitNotes } from "@/lib/data/debit-notes";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { listJournalEntries } from "@/lib/data/journal-entries";
import { getCompanyById } from "@/lib/data/companies";
import { buildVatSummary } from "@/lib/utils/vat-report";
import { hasOpeningEntry, OPENING_BALANCE_SOURCE } from "@/lib/utils/financial-statements";
import { roundMoney } from "@/lib/utils/invoice";
import { buildHrReport } from "@/lib/reports/hr-reports";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 1000 * 60 * 60 * 24;

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

const isValidDate = (value?: string | null) =>
  Boolean(value && DATE_REGEX.test(value));

const normalizeRange = (startDate?: string | null, endDate?: string | null) => {
  const today = new Date();
  const defaultEnd = formatDate(today);
  const defaultStart = formatDate(new Date(today.getTime() - 30 * DAY_MS));

  let start = isValidDate(startDate) ? (startDate as string) : defaultStart;
  let end = isValidDate(endDate) ? (endDate as string) : defaultEnd;

  if (start > end) {
    [start, end] = [end, start];
  }

  const startDateValue = toDate(start);
  const endDateValue = toDate(end);
  const days = Math.max(1, Math.round((endDateValue.getTime() - startDateValue.getTime()) / DAY_MS) + 1);
  const previousEnd = new Date(startDateValue.getTime() - DAY_MS);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * DAY_MS);

  return {
    startDate: start,
    endDate: end,
    previousStartDate: formatDate(previousStart),
    previousEndDate: formatDate(previousEnd),
    days,
  };
};

const inRange = (value: string, start: string, end: string) => value >= start && value <= end;

const calcTrend = (current: number, previous: number) => {
  const delta = current - previous;
  if (previous === 0) {
    return { delta, percent: null };
  }
  return { delta, percent: (delta / Math.abs(previous)) * 100 };
};

const SALES_REVENUE_STATUSES = new Set(["approved", "sent", "partially_paid", "paid"]);
const POSTED_BILL_STATUSES = new Set(["approved", "partially_paid", "paid"]);
const OPEN_INVOICE_STATUSES = new Set(["approved", "sent", "partially_paid"]);

export type AnalyticsOverview = {
  generatedAt: string;
  currency: string;
  range: {
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    days: number;
  };
  accounting: {
    revenue: number;
    revenueTrend: { delta: number; percent: number | null };
    expenses: number;
    expensesTrend: { delta: number; percent: number | null };
    overdueCount: number;
    overdueAmount: number;
    cashBalance: number;
    netCashFlow: number;
  };
  vat: {
    outputVat: number;
    inputVat: number;
    netVat: number;
  };
  hr: {
    headcount: number;
    activeEmployees: number;
    absenteeismRate: number;
    payrollCost: number;
    leaveDays: number;
  };
  details: {
    overdueInvoices: Array<{
      id: string;
      invoiceNumber: string;
      customerId: string;
      customerName: string;
      dueDate: string;
      balance: number;
    }>;
    topCustomers: Array<{
      customerId: string;
      customerName: string;
      total: number;
      invoicesCount: number;
    }>;
    expenseCategories: Array<{
      categoryId: string;
      categoryName: string;
      total: number;
      count: number;
    }>;
  };
};

export async function buildAnalyticsOverview(params: {
  companyId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<AnalyticsOverview> {
  const range = normalizeRange(params.startDate, params.endDate);
  const today = formatDate(new Date());

  const [
    company,
    invoices,
    creditNotes,
    debitNotes,
    bills,
    vendorCreditNotes,
    expenses,
    cashAccounts,
    journalEntries,
  ] = await Promise.all([
    getCompanyById(params.companyId),
    listSalesInvoices(params.companyId),
    listSalesCreditNotes(params.companyId),
    listSalesDebitNotes(params.companyId),
    listPurchaseBills(params.companyId),
    listVendorCreditNotes(params.companyId),
    listExpenses(params.companyId),
    listCashBankAccounts(params.companyId),
    listJournalEntries(params.companyId),
  ]);

  const currency = company?.currency ?? "SAR";

  const revenueBetween = (start: string, end: string) =>
    roundMoney(
      invoices
        .filter(
          (invoice) =>
            SALES_REVENUE_STATUSES.has(invoice.status) &&
            inRange(invoice.invoiceDate, start, end)
        )
        .reduce((sum, invoice) => sum + invoice.subtotal, 0) +
        debitNotes
          .filter((note) => note.status === "issued" && inRange(note.issueDate, start, end))
          .reduce((sum, note) => sum + note.subtotal, 0) -
        creditNotes
          .filter((note) => note.status === "issued" && inRange(note.issueDate, start, end))
          .reduce((sum, note) => sum + note.subtotal, 0)
    );
  const expensesBetween = (start: string, end: string) =>
    roundMoney(
      expenses
        .filter(
          (expense) =>
            expense.status === "approved" && inRange(expense.expenseDate, start, end)
        )
        .reduce((sum, expense) => sum + expense.netAmount, 0) +
        bills
          .filter(
            (bill) =>
              POSTED_BILL_STATUSES.has(bill.status) && inRange(bill.billDate, start, end)
          )
          .reduce((sum, bill) => sum + bill.subtotal, 0) -
        vendorCreditNotes
          .filter((note) => note.status === "issued" && inRange(note.issueDate, start, end))
          .reduce((sum, note) => sum + note.subtotal, 0)
    );

  const revenue = revenueBetween(range.startDate, range.endDate);
  const previousRevenue = revenueBetween(range.previousStartDate, range.previousEndDate);
  const expenseTotal = expensesBetween(range.startDate, range.endDate);
  const previousExpenseTotal = expensesBetween(
    range.previousStartDate,
    range.previousEndDate
  );

  const overdueAll = invoices
    .filter(
      (invoice) =>
        OPEN_INVOICE_STATUSES.has(invoice.status) &&
        invoice.dueDate < today &&
        invoice.balance > 0
    )
    .map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      dueDate: invoice.dueDate,
      balance: invoice.balance,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 50);

  const overdueInvoices = overdueAll.slice(0, 10);

  const topCustomersMap = new Map<
    string,
    { customerId: string; customerName: string; total: number; invoicesCount: number }
  >();
  invoices
    .filter(
      (invoice) =>
        SALES_REVENUE_STATUSES.has(invoice.status) &&
        inRange(invoice.invoiceDate, range.startDate, range.endDate)
    )
    .forEach((invoice) => {
      const entry =
        topCustomersMap.get(invoice.customerId) ?? {
          customerId: invoice.customerId,
          customerName: invoice.customerName,
          total: 0,
          invoicesCount: 0,
        };
      entry.total += invoice.subtotal;
      entry.invoicesCount += 1;
      topCustomersMap.set(invoice.customerId, entry);
    });

  const topCustomers = Array.from(topCustomersMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const expenseCategoryMap = new Map<
    string,
    { categoryId: string; categoryName: string; total: number; count: number }
  >();
  expenses
    .filter(
      (expense) =>
        expense.status === "approved" &&
        inRange(expense.expenseDate, range.startDate, range.endDate)
    )
    .forEach((expense) => {
      const entry =
        expenseCategoryMap.get(expense.categoryId) ?? {
          categoryId: expense.categoryId,
          categoryName: expense.categoryName,
          total: 0,
          count: 0,
        };
      entry.total += expense.netAmount;
      entry.count += 1;
      expenseCategoryMap.set(expense.categoryId, entry);
    });

  const expenseCategories = Array.from(expenseCategoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  // Cash comes from the ledger, so it agrees with the cash flow report.
  const cashAccountIds = new Set(cashAccounts.map((account) => account.accountId));
  const openingPosted = hasOpeningEntry(journalEntries);
  let cashBalance = openingPosted
    ? 0
    : cashAccounts.reduce((sum, account) => sum + account.openingBalance, 0);
  let netCashFlow = 0;
  journalEntries
    .filter((entry) => entry.status === "posted")
    .forEach((entry) => {
      const delta = entry.lines
        .filter((line) => cashAccountIds.has(line.accountId))
        .reduce((sum, line) => sum + line.debit - line.credit, 0);
      cashBalance += delta;
      if (
        entry.sourceType !== OPENING_BALANCE_SOURCE &&
        inRange(entry.date, range.startDate, range.endDate)
      ) {
        netCashFlow += delta;
      }
    });
  cashBalance = roundMoney(cashBalance);
  netCashFlow = roundMoney(netCashFlow);

  const vat = await buildVatSummary({
    companyId: params.companyId,
    startDate: range.startDate,
    endDate: range.endDate,
  });

  const hr = await buildHrReport({
    companyId: params.companyId,
    startDate: range.startDate,
    endDate: range.endDate,
  });

  return {
    generatedAt: new Date().toISOString(),
    currency,
    range,
    accounting: {
      revenue,
      revenueTrend: calcTrend(revenue, previousRevenue),
      expenses: expenseTotal,
      expensesTrend: calcTrend(expenseTotal, previousExpenseTotal),
      overdueCount: overdueAll.length,
      overdueAmount: overdueAll.reduce((sum, invoice) => sum + invoice.balance, 0),
      cashBalance,
      netCashFlow,
    },
    vat: {
      outputVat: vat.outputVat,
      inputVat: vat.inputVat,
      netVat: vat.netVat,
    },
    hr: {
      headcount: hr.kpis.headcount,
      activeEmployees: hr.kpis.activeEmployees,
      absenteeismRate: hr.kpis.absenteeismRate,
      payrollCost: hr.kpis.payrollCost,
      leaveDays: hr.kpis.leaveDays,
    },
    details: {
      overdueInvoices,
      topCustomers,
      expenseCategories,
    },
  };
}
