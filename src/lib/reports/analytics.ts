import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listExpenses } from "@/lib/data/expenses";
import { listCashBankAccounts } from "@/lib/data/cash-bank-accounts";
import { listCashTransactions } from "@/lib/data/cash-transactions";
import { getCompanyById } from "@/lib/data/companies";
import { buildVatSummary } from "@/lib/utils/vat-report";
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

  const [company, invoices, expenses, cashAccounts] = await Promise.all([
    getCompanyById(params.companyId),
    listSalesInvoices(params.companyId),
    listExpenses(params.companyId),
    listCashBankAccounts(params.companyId),
  ]);

  const currency = company?.currency ?? "SAR";

  const revenue = invoices
    .filter(
      (invoice) =>
        SALES_REVENUE_STATUSES.has(invoice.status) &&
        inRange(invoice.invoiceDate, range.startDate, range.endDate)
    )
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const previousRevenue = invoices
    .filter(
      (invoice) =>
        SALES_REVENUE_STATUSES.has(invoice.status) &&
        inRange(invoice.invoiceDate, range.previousStartDate, range.previousEndDate)
    )
    .reduce((sum, invoice) => sum + invoice.total, 0);

  const expenseTotal = expenses
    .filter(
      (expense) =>
        expense.status === "approved" &&
        inRange(expense.expenseDate, range.startDate, range.endDate)
    )
    .reduce((sum, expense) => sum + expense.amount, 0);

  const previousExpenseTotal = expenses
    .filter(
      (expense) =>
        expense.status === "approved" &&
        inRange(expense.expenseDate, range.previousStartDate, range.previousEndDate)
    )
    .reduce((sum, expense) => sum + expense.amount, 0);

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
      entry.total += invoice.total;
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
      entry.total += expense.amount;
      entry.count += 1;
      expenseCategoryMap.set(expense.categoryId, entry);
    });

  const expenseCategories = Array.from(expenseCategoryMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  let cashBalance = 0;
  let netCashFlow = 0;
  const transactionGroups = await Promise.all(
    cashAccounts.map(async (account) => {
      const transactions = await listCashTransactions(params.companyId, account.id);
      return { account, transactions };
    })
  );

  transactionGroups.forEach(({ account, transactions }) => {
    const balanceDelta = transactions.reduce((sum, tx) => {
      const signed = tx.direction === "in" ? tx.amount : -tx.amount;
      return sum + signed;
    }, 0);
    cashBalance += account.openingBalance + balanceDelta;

    const rangeDelta = transactions.reduce((sum, tx) => {
      if (!inRange(tx.date, range.startDate, range.endDate)) {
        return sum;
      }
      const signed = tx.direction === "in" ? tx.amount : -tx.amount;
      return sum + signed;
    }, 0);
    netCashFlow += rangeDelta;
  });

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
