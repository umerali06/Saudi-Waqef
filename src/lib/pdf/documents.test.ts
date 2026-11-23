import { writeFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ db: {} }));

import { messages } from "@/i18n/messages";
import { renderBill } from "@/lib/pdf/bill";
import {
  balanceSheetModel,
  cashFlowModel,
  generalLedgerModel,
  hrReportModel,
  profitLossModel,
  trialBalanceModel,
  vatReturnModel,
} from "@/lib/pdf/financial-reports";
import type { DocumentStyle } from "@/lib/pdf/parts";
import { renderReport, reportAmount, reportPeriod, type ReportModel } from "@/lib/pdf/report";
import { renderVoucher } from "@/lib/pdf/voucher";
import type { HrReport } from "@/lib/reports/hr-reports";

const company = {
  name: "شركة الاختبار لخدمات الأعمال",
  vatNumber: "399999999900003",
  crNumber: "1010010000",
};
const style: DocumentStyle = {
  seller: { ...company, address: "طريق الملك فهد، الرياض" },
  accent: "#185fa5",
  template: "classic",
};
const save = (name: string, pdf: Buffer) => {
  if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${name}.pdf`, pdf);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5000);
};

const account = (code: string, name: string, amount: number) => ({
  accountId: code,
  code,
  name,
  amount,
});
const section = (...accounts: ReturnType<typeof account>[]) => ({
  accounts,
  total: accounts.reduce((sum, entry) => sum + entry.amount, 0),
});
const revenue = section(account("4100", "إيرادات المبيعات", 5000), account("4200", "إيرادات الخدمات", 1200));
const expenses = section(account("6100", "مصروف الرواتب", 3000), account("6200", "مصروف الإيجار", 4000));
const cogs = section(account("5100", "تكلفة البضاعة المباعة", 500));

const models = (locale: "ar" | "en"): Record<string, ReportModel> => {
  const context = { locale, company };
  return {
    "trial-balance": trialBalanceModel(context, {
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      includeCompare: false,
      rows: Array.from({ length: 45 }, (_, index) => ({
        label: `${1100 + index} - النقد في الصندوق رقم ${index + 1}`,
        openingDebit: 100 * index,
        openingCredit: 0,
        movementDebit: 1234.5,
        movementCredit: 234.5,
        closingDebit: 1000 + 100 * index,
        closingCredit: 0,
        compareDebit: 0,
        compareCredit: 0,
      })),
    }),
    "general-ledger": generalLedgerModel(context, {
      accountLabel: "1120 - الحسابات البنكية",
      startDate: "2026-01-01",
      endDate: null,
      openingBalance: 500,
      closingBalance: -650,
      lines: [
        { date: "2026-01-05", memo: "Receipt RCPT-1 من العميل", source: "payment_receipt", debit: 1150, credit: 0, balance: 1650 },
        { date: "2026-01-09", memo: "سداد فاتورة BILL-7", source: "bill_payment", debit: 0, credit: 2300, balance: -650 },
      ],
    }),
    "profit-loss": profitLossModel(context, {
      period: { startDate: "2026-01-01", endDate: "2026-03-31" },
      comparePeriod: { startDate: "2025-01-01", endDate: "2025-03-31" },
      revenue,
      cogs,
      expenses,
      grossProfit: 5700,
      netProfit: -1300,
      compare: { revenue, cogs, expenses, grossProfit: 5700, netProfit: -1300 },
    }),
    "balance-sheet": balanceSheetModel(context, {
      asOfDate: "2026-03-31",
      assets: section(account("1110", "النقد في الصندوق", 9000)),
      liabilities: section(account("2110", "الذمم الدائنة", 4000)),
      equity: section(account("3100", "رأس المال", 6300), {
        ...account("", "Current earnings", -1300),
        accountId: "current-earnings",
      }),
      totals: { assets: 9000, liabilities: 4000, equity: 5000, liabilitiesEquity: 9000 },
      difference: 0,
    }),
    "cash-flow": cashFlowModel(context, {
      period: { startDate: "2026-01-01", endDate: "2026-03-31" },
      openingCash: 1000,
      closingCash: 1300,
      netCashChange: 300,
      netProfit: 300,
      assetChange: 100,
      liabilityChange: 100,
      equityChange: 0,
      netCashFromOperations: 300,
      netCashFromInvesting: 0,
      netCashFromFinancing: 0,
      otherChange: 0,
      cashAccounts: [{ accountId: "c", name: "بنك الراجحي", opening: 1000, change: 300, closing: 1300 }],
    }),
    "vat-return": vatReturnModel(context, {
      periodName: "الربع الأول 2026",
      status: "open",
      summary: {
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        sales: { netAmount: 1900, taxAmount: 150, totalAmount: 2050 },
        purchases: { netAmount: 2500, taxAmount: 360, totalAmount: 2860 },
        adjustments: { output: 10, input: 4, net: 6 },
        outputVat: 160,
        inputVat: 364,
        netVat: -204,
        exports: 300,
        citizenServices: 0,
        breakdown: {
          sales: [
            { rate: 0, type: "zero", taxableAmount: 600, taxAmount: 0 },
            { rate: 0, type: "exempt", taxableAmount: 300, taxAmount: 0 },
            { rate: 15, type: "standard", taxableAmount: 1000, taxAmount: 150 },
          ],
          purchases: [{ rate: 15, type: "standard", taxableAmount: 2400, taxAmount: 360 }],
        },
      },
    }),
    "hr-report": hrReportModel(context, {
      range: { startDate: "2026-01-01", endDate: "2026-03-31" },
      kpis: { headcount: 3, activeEmployees: 2, absenteeismRate: 0.05, overtimeHours: 4, payrollCost: 15000, leaveDays: 2 },
      employees: {
        byDepartment: [{ id: "d", nameAr: "المبيعات", nameEn: "Sales", count: 3 }],
        byPosition: [],
        byStatus: [],
        hires: [],
        terminations: [],
      },
      attendance: { byEmployee: [], byDepartment: [] },
      leave: { balances: [], usageByType: [], pendingRequests: [] },
      payroll: { currentRun: null, previousRun: null, variance: null, byDepartment: [], netDistribution: [] },
    } as HrReport),
  };
};

describe("report PDFs", () => {
  it.each(Object.keys(models("ar")))("renders %s in both languages", async (name) => {
    save(`${name}-ar`, await renderReport(models("ar")[name]));
    save(`${name}-en`, await renderReport(models("en")[name]));
  }, 30_000);

  it("uses only labels that exist in both languages", () => {
    for (const locale of ["ar", "en"] as const) {
      for (const model of Object.values(models(locale))) {
        const labels = [
          model.title,
          ...(model.summary ?? []).map(([label]) => label),
          ...model.tables.flatMap((table) => [
            ...table.columns.map((column) => column.header),
            ...table.rows.flatMap((row) => row.cells),
          ]),
        ];
        for (const label of labels) {
          expect(label).not.toMatch(/^(reports|vatReturn|hr|statement)\./);
        }
      }
    }
    expect(Object.keys(messages.ar).filter((key) => /^(statement|vatReturn|reports\.pdf)\./.test(key)))
      .toEqual(Object.keys(messages.en).filter((key) => /^(statement|vatReturn|reports\.pdf)\./.test(key)));
  });

  it("writes negatives in brackets and drops empty period ends", () => {
    expect(reportAmount(-1234.5)).toBe("(1,234.50)");
    expect(reportAmount(-0.001)).toBe("0.00");
    expect(reportPeriod("en", "2026-01-01", null)).toBe("From 2026-01-01");
    expect(reportPeriod("en")).toBe("");
    expect(reportPeriod("ar", "2026-01-01", "2026-03-31")).toBe("من 2026/01/01  إلى 2026/03/31");
  });
});

describe("company documents", () => {
  it.each(["classic", "modern", "minimal"] as const)("renders vouchers and bills (%s)", async (template) => {
    save(
      `receipt-${template}`,
      await renderVoucher({
        kind: "receipt",
        style: { ...style, template },
        number: "RCPT-12",
        date: "2026-03-09",
        party: { name: "شركة العميل للمحاماة", vatNumber: "399999999800003" },
        currency: "SAR",
        amount: 1150.5,
        unappliedAmount: 150.5,
        methodAr: "تحويل بنكي",
        methodEn: "Bank transfer",
        accountName: "بنك الراجحي",
        reference: "TRX-99",
        allocations: [{ number: "INV-4", amount: 1000 }],
      })
    );
    save(
      `bill-${template}`,
      await renderBill({
        style: { ...style, template },
        status: "approved",
        number: "BILL-7",
        vendorNumber: "V-2026-55",
        billDate: "2026-03-01",
        dueDate: "2026-03-31",
        vendor: { name: "مؤسسة التوريدات", vatNumber: "399999999700003", address: "جدة" },
        currency: "SAR",
        lines: [
          { description: "ورق طباعة A4", quantity: 10, unit: "كرتون", unitPrice: 100, discount: 50, net: 950, taxPercent: 15, tax: 142.5, total: 1092.5 },
          { description: "Toner", quantity: 2, unit: "1", unitPrice: 200, discount: 0, net: 400, taxPercent: 15, tax: 60, total: 460 },
        ],
        subtotal: 1350,
        discountTotal: 50,
        taxTotal: 202.5,
        total: 1552.5,
        amountPaid: 500,
        amountCredited: 0,
        balance: 1052.5,
        notes: "التسليم في المستودع الرئيسي",
      })
    );
  }, 30_000);
});
