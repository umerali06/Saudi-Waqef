"use client";

import { DashboardPreview, FinanceSections } from "@/components/dashboard/finance-sections";
import { NavIcon, type NavIconName } from "@/components/nav-icons";
import { useTranslations } from "@/i18n/provider";
import type { DashboardFinance } from "@/lib/reports/dashboard";

type Translate = ReturnType<typeof useTranslations>["t"];

const TREND = [
  [148200, 91300], [162400, 98800], [155100, 102600], [171900, 99400], [183700, 110200], [176300, 104900],
  [194800, 117300], [205600, 121800], [198400, 113700], [221900, 126400], [233500, 131900], [246800, 128600],
];
const MONTHS = ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

/** Invented figures that add up the way real books do. */
const sampleFinance = (t: Translate): DashboardFinance => ({
  overview: {
    accounting: {
      revenue: 246800,
      revenueTrend: { delta: 13300, percent: 5.7 },
      expenses: 128600,
      expensesTrend: { delta: -3300, percent: -2.5 },
      overdueCount: 3,
      overdueAmount: 41975,
      cashBalance: 418250.5,
      netCashFlow: 73640,
    },
    range: {
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      previousStartDate: "2026-05-02",
      previousEndDate: "2026-05-31",
      days: 30,
    },
    details: {
      overdueInvoices: [
        { id: "1", invoiceNumber: "INV-1182", customerId: "1", customerName: t("landing.preview.c2"), dueDate: "2026-06-12", balance: 18400 },
        { id: "2", invoiceNumber: "INV-1169", customerId: "2", customerName: t("landing.preview.c4"), dueDate: "2026-05-28", balance: 15525 },
        { id: "3", invoiceNumber: "INV-1140", customerId: "3", customerName: t("landing.preview.c1"), dueDate: "2026-04-30", balance: 8050 },
      ],
      topCustomers: [
        { customerId: "1", customerName: t("landing.preview.c2"), total: 86500, invoicesCount: 4 },
        { customerId: "2", customerName: t("landing.preview.c1"), total: 64200, invoicesCount: 6 },
        { customerId: "3", customerName: t("landing.preview.c3"), total: 52900, invoicesCount: 3 },
        { customerId: "4", customerName: t("landing.preview.c4"), total: 43200, invoicesCount: 2 },
      ],
      expenseCategories: [
        { categoryId: "1", categoryName: t("landing.preview.e1"), total: 42000, count: 1 },
        { categoryId: "2", categoryName: t("landing.preview.e2"), total: 18750, count: 5 },
        { categoryId: "3", categoryName: t("landing.preview.e3"), total: 9320, count: 11 },
        { categoryId: "4", categoryName: t("landing.preview.e4"), total: 4180, count: 7 },
      ],
    },
  },
  trend: MONTHS.map((month, index) => ({ month, revenue: TREND[index][0], expenses: TREND[index][1] })),
  receivables: {
    total: 148925,
    buckets: { current: 106950, d30: 18400, d60: 15525, d90: 8050, older: 0 },
  },
  payables: {
    total: 57040,
    overdue: 0,
    next7: 21850,
    bills: [
      { id: "1", billNumber: "BILL-311", vendorName: t("landing.preview.v1"), dueDate: "2026-07-04", balance: 21850 },
      { id: "2", billNumber: "BILL-309", vendorName: t("landing.preview.v3"), dueDate: "2026-07-15", balance: 19550 },
      { id: "3", billNumber: "BILL-305", vendorName: t("landing.preview.v2"), dueDate: "2026-07-22", balance: 15640 },
    ],
  },
  recentInvoices: [
    { id: "1", invoiceNumber: "INV-1204", customerName: t("landing.preview.c1"), invoiceDate: "2026-06-29", status: "sent", total: 27600 },
    { id: "2", invoiceNumber: "INV-1203", customerName: t("landing.preview.c3"), invoiceDate: "2026-06-28", status: "paid", total: 13225 },
    { id: "3", invoiceNumber: "INV-1202", customerName: t("landing.preview.c2"), invoiceDate: "2026-06-25", status: "partially_paid", total: 46000 },
    { id: "4", invoiceNumber: "INV-1201", customerName: t("landing.preview.c4"), invoiceDate: "2026-06-24", status: "paid", total: 9775 },
  ],
  vat: {
    periodName: t("landing.preview.period"),
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    dueDate: "2026-07-31",
    daysLeft: 31,
    outputVat: 105330,
    inputVat: 46215,
    netVat: 59115,
  },
  einvoicing: { environment: "production", ready: true, filed: 1198, pending: 2, rejected: 0, unsent: 0, lastError: null },
  setup: { company: true, accounts: true, tax: true, branding: true, zatca: true },
});

const NAV: Array<[NavIconName, string]> = [
  ["dashboard", "nav.dashboard"], ["sales", "nav.sales"], ["purchases", "nav.purchases"], ["payments", "nav.payments"],
  ["items", "nav.items"], ["reports", "nav.reports"], ["hr", "nav.hr"], ["documents", "nav.documents"],
  ["integrations", "nav.integrations"],
];

/** The product's own dashboard components on the landing page: never a drawing that drifts from them. */
export function ProductPreview() {
  const { t } = useTranslations();

  return (
    <figure className="mx-auto mt-14 max-w-6xl lg:mt-20">
      <div className="product-frame" inert aria-hidden>
        <div className="product-scale product-scroll flex">
          <div className="app-sidebar hidden w-60 shrink-0 flex-col lg:flex">
            <div className="flex h-16 items-center gap-3 px-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#6fb1ee] text-[#0b2239]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round">
                  <path d="M4 20V10l8-6 8 6v10H4Zm5 0v-5.5a3 3 0 0 1 6 0V20" />
                </svg>
              </span>
              <span className="text-[15px] font-semibold text-white">{t("app.name")}</span>
            </div>
            <ul className="space-y-0.5 px-3">
              {NAV.map(([icon, key], index) => (
                <li
                  key={key}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    index === 0 ? "bg-white/10 font-semibold text-white" : "text-[#b9c7d6]"
                  }`}
                >
                  <NavIcon name={icon} />
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 flex-1 text-start">
            <div className="app-header flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
              <span className="truncate rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
                {t("landing.preview.company")}
              </span>
              <span className="flex items-center gap-3 text-muted">
                <NavIcon name="bell" className="h-5 w-5" />
                <span className="h-8 w-8 rounded-full bg-[#dbe8f5]" />
              </span>
            </div>
            <div className="space-y-5 p-4 sm:p-6">
              <DashboardPreview value={true}>
                <FinanceSections finance={sampleFinance(t)} currency="SAR" role="owner" />
              </DashboardPreview>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-muted">{t("landing.preview.caption")}</figcaption>
    </figure>
  );
}
