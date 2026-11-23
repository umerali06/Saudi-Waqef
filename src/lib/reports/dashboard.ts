import { listSalesCreditNotes } from "@/lib/data/credit-notes";
import { getCompanyById } from "@/lib/data/companies";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getDocumentBranding } from "@/lib/data/document-branding";
import { listExpenses } from "@/lib/data/expenses";
import { listIntegrations } from "@/lib/data/integrations";
import { listPurchaseBills } from "@/lib/data/purchase-bills";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { listVatPeriods } from "@/lib/data/vat-periods";
import { listVendorCreditNotes } from "@/lib/data/vendor-credit-notes";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { buildAnalyticsOverview, type AnalyticsOverview } from "@/lib/reports/analytics";
import {
  buildAging,
  buildMonthlyTrend,
  daysBetween,
  monthsEndingAt,
  pickVatPeriod,
  vatReturnDueDate,
  type AgingBucket,
  type MonthPoint,
} from "@/lib/reports/dashboard-metrics";
import { riyadhDateTime } from "@/lib/integrations/zatca/time";
import type { ZatcaEnvironment } from "@/lib/integrations/zatca/environment";
import type { Role } from "@/lib/types";
import { buildVatSummary } from "@/lib/utils/vat-report";

const POSTED_INVOICE = new Set(["approved", "sent", "partially_paid", "paid"]);
const POSTED_BILL = new Set(["approved", "partially_paid", "paid"]);

export type SetupStep = "company" | "accounts" | "tax" | "branding" | "zatca";

export type DashboardFinance = {
  overview: Pick<AnalyticsOverview, "accounting" | "range" | "details">;
  trend: MonthPoint[];
  receivables: { total: number; buckets: Record<AgingBucket, number> };
  payables: {
    total: number;
    overdue: number;
    next7: number;
    bills: Array<{ id: string; billNumber: string; vendorName: string; dueDate: string; balance: number }>;
  };
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    customerName: string;
    invoiceDate: string;
    status: string;
    total: number;
  }>;
  vat: {
    periodName: string;
    startDate: string;
    endDate: string;
    dueDate: string;
    daysLeft: number;
    outputVat: number;
    inputVat: number;
    netVat: number;
  } | null;
  einvoicing: {
    environment: ZatcaEnvironment | null;
    ready: boolean;
    filed: number;
    pending: number;
    rejected: number;
    unsent: number;
    lastError: string | null;
  };
  setup: Record<SetupStep, boolean>;
};

export type DashboardData = {
  currency: string;
  generatedAt: string;
  finance: DashboardFinance | null;
  hr: AnalyticsOverview["hr"] | null;
};

const FINANCE_ROLES: Role[] = ["owner", "admin", "accountant", "viewer"];
const HR_ROLES: Role[] = ["owner", "admin", "hr"];

export async function buildDashboard(params: {
  companyId: string;
  role: Role;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<DashboardData> {
  const showFinance = FINANCE_ROLES.includes(params.role);
  const showHr = HR_ROLES.includes(params.role);
  const company = await getCompanyById(params.companyId);
  const base = {
    currency: company?.currency ?? "SAR",
    generatedAt: new Date().toISOString(),
  };
  if (!showFinance && !showHr) return { ...base, finance: null, hr: null };

  const overview = await buildAnalyticsOverview(params);
  if (!showFinance) return { ...base, finance: null, hr: overview.hr };

  const today = riyadhDateTime(new Date()).date;
  const [
    invoices,
    creditNotes,
    bills,
    vendorCredits,
    expenses,
    vatPeriods,
    integrations,
    artifacts,
    defaults,
    taxCategories,
    branding,
  ] = await Promise.all([
    listSalesInvoices(params.companyId),
    listSalesCreditNotes(params.companyId),
    listPurchaseBills(params.companyId),
    listVendorCreditNotes(params.companyId),
    listExpenses(params.companyId),
    listVatPeriods(params.companyId),
    listIntegrations(params.companyId),
    listZatcaArtifactsByCompany(params.companyId, 5000),
    getCompanyDefaults(params.companyId),
    listTaxCategories(params.companyId),
    getDocumentBranding(params.companyId),
  ]);

  const posted = invoices.filter((invoice) => POSTED_INVOICE.has(invoice.status));
  const postedBills = bills.filter((bill) => POSTED_BILL.has(bill.status));
  const openBills = postedBills
    .filter((bill) => bill.balance > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const period = pickVatPeriod(vatPeriods, today);
  const vatSummary = period
    ? await buildVatSummary({
        companyId: params.companyId,
        startDate: period.startDate,
        endDate: period.endDate,
        periodId: period.id,
      })
    : null;
  const vatDue = period ? vatReturnDueDate(period.endDate) : "";

  const rank = (environment: string) =>
    environment === "production" ? 2 : environment === "simulation" ? 1 : 0;
  const zatca = integrations
    .filter((item) => item.connector === "zatca")
    .sort(
      (a, b) =>
        Number(b.config?.onboardingStatus === "production_ready") -
          Number(a.config?.onboardingStatus === "production_ready") ||
        rank(b.environment) - rank(a.environment)
    )[0];
  const documents = artifacts.filter(
    (artifact) => zatca && (artifact.environment ?? "sandbox") === zatca.environment
  );
  const documentIds = new Set(documents.map((artifact) => artifact.invoiceId));
  const goLive =
    zatca && zatca.environment !== "sandbox" && typeof zatca.config?.productionCsidIssuedAt === "string"
      ? riyadhDateTime(new Date(zatca.config.productionCsidIssuedAt)).date
      : "";
  const isFiled = (status?: string) => status === "accepted" || status === "warning";

  return {
    ...base,
    hr: showHr ? overview.hr : null,
    finance: {
      overview: {
        accounting: overview.accounting,
        range: overview.range,
        details: overview.details,
      },
      trend: buildMonthlyTrend(
        monthsEndingAt(overview.range.endDate, 12),
        [
          ...posted.map((row) => ({ date: row.invoiceDate, amount: row.subtotal })),
          ...creditNotes
            .filter((note) => note.status === "issued")
            .map((note) => ({ date: note.issueDate, amount: -note.subtotal })),
        ],
        [
          ...postedBills.map((row) => ({ date: row.billDate, amount: row.subtotal })),
          ...vendorCredits
            .filter((note) => note.status === "issued")
            .map((note) => ({ date: note.issueDate, amount: -note.subtotal })),
          ...expenses
            .filter((row) => row.status === "approved")
            .map((row) => ({ date: row.expenseDate, amount: row.netAmount })),
        ]
      ),
      receivables: buildAging(posted, today),
      payables: {
        total: openBills.reduce((sum, bill) => sum + bill.balance, 0),
        overdue: openBills
          .filter((bill) => bill.dueDate < today)
          .reduce((sum, bill) => sum + bill.balance, 0),
        next7: openBills
          .filter((bill) => {
            const days = daysBetween(today, bill.dueDate);
            return days >= 0 && days <= 7;
          })
          .reduce((sum, bill) => sum + bill.balance, 0),
        bills: openBills.slice(0, 5).map((bill) => ({
          id: bill.id,
          billNumber: bill.billNumber,
          vendorName: bill.vendorName,
          dueDate: bill.dueDate,
          balance: bill.balance,
        })),
      },
      recentInvoices: [...invoices]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 6)
        .map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          status: invoice.status,
          total: invoice.total,
        })),
      vat:
        period && vatSummary
          ? {
              periodName: period.name,
              startDate: period.startDate,
              endDate: period.endDate,
              dueDate: vatDue,
              daysLeft: daysBetween(today, vatDue),
              outputVat: vatSummary.outputVat,
              inputVat: vatSummary.inputVat,
              netVat: vatSummary.netVat,
            }
          : null,
      einvoicing: {
        environment: zatca?.environment ?? null,
        ready: zatca?.config?.onboardingStatus === "production_ready",
        filed: documents.filter((artifact) => isFiled(artifact.status)).length,
        pending: documents.filter(
          (artifact) => artifact.status === "pending" || artifact.status === "submitted"
        ).length,
        rejected: documents.filter((artifact) => artifact.status === "rejected").length,
        unsent: posted.filter(
          (invoice) => !documentIds.has(invoice.id) && (!goLive || invoice.invoiceDate >= goLive)
        ).length,
        lastError: zatca?.lastError ?? null,
      },
      setup: {
        company: Boolean(company?.legalName && company.vatNumber && company.crNumber),
        accounts: Boolean(
          defaults.salesAccountId && defaults.receivableAccountId && defaults.payableAccountId
        ),
        tax: taxCategories.some((item) => item.status === "active" && item.rate > 0),
        branding: Boolean(branding.logoUrl),
        zatca: zatca?.config?.onboardingStatus === "production_ready" && zatca.environment === "production",
      },
    },
  };
}
