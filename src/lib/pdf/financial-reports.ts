import type { Locale } from "@/i18n/messages";
import type { Column } from "@/lib/pdf/builder";
import {
  inlineDate,
  reportAmount,
  reportPeriod,
  translator,
  type ReportCompany,
  type ReportModel,
  type ReportRow,
} from "@/lib/pdf/report";
import type { HrReport } from "@/lib/reports/hr-reports";
import {
  CURRENT_EARNINGS_ID,
  type BalanceSheetReport,
  type BalanceSheetSection,
  type CashFlowReport,
  type ProfitLossReport,
  type ProfitLossSection,
} from "@/lib/utils/financial-statements";
import { ledgerSourceKey } from "@/lib/utils/ledger-sources";
import { buildVatReturn, type VatReturnBox } from "@/lib/utils/vat-return";
import type { VatSummary } from "@/lib/utils/vat-report";

type Context = { locale: Locale; company: ReportCompany };

// Physically right in both languages, so decimal points line up.
const amountColumn = (header: string, width = 18): Column => ({ header, width, align: "right" });

const accountName = (account: { code: string; name: string }) =>
  account.code ? `${account.code} - ${account.name}` : account.name;

export type TrialBalanceRow = {
  label: string;
  openingDebit: number;
  openingCredit: number;
  movementDebit: number;
  movementCredit: number;
  closingDebit: number;
  closingCredit: number;
  compareDebit: number;
  compareCredit: number;
};

export function trialBalanceModel(
  context: Context,
  params: {
    rows: TrialBalanceRow[];
    startDate?: string | null;
    endDate?: string | null;
    includeCompare: boolean;
  }
): ReportModel {
  const t = translator(context.locale);
  const fields = [
    "openingDebit",
    "openingCredit",
    "movementDebit",
    "movementCredit",
    "closingDebit",
    "closingCredit",
    ...(params.includeCompare ? (["compareDebit", "compareCredit"] as const) : []),
  ] as const;
  const totals = fields.map((field) =>
    reportAmount(params.rows.reduce((sum, row) => sum + row[field], 0))
  );
  return {
    ...context,
    title: t("reports.trialBalance.title"),
    subtitle: reportPeriod(context.locale, params.startDate, params.endDate),
    landscape: true,
    tables: [
      {
        columns: [
          { header: t("reports.trialBalance.account"), width: 34 },
          ...fields.map((field) => amountColumn(t(`reports.trialBalance.${field}`), 14)),
        ],
        rows: [
          ...params.rows.map((row): ReportRow => ({
            cells: [row.label, ...fields.map((field) => reportAmount(row[field]))],
          })),
          ...(params.rows.length > 0
            ? [{ cells: [t("reports.trialBalance.total"), ...totals], kind: "total" as const }]
            : []),
        ],
        empty: t("reports.trialBalance.empty"),
      },
    ],
  };
}

export function generalLedgerModel(
  context: Context,
  params: {
    accountLabel: string;
    startDate?: string | null;
    endDate?: string | null;
    openingBalance: number;
    closingBalance: number;
    lines: Array<{
      date: string;
      memo: string;
      source: string;
      debit: number;
      credit: number;
      balance: number;
    }>;
  }
): ReportModel {
  const t = translator(context.locale);
  const sum = (pick: (line: { debit: number; credit: number }) => number) =>
    reportAmount(params.lines.reduce((total, line) => total + pick(line), 0));
  return {
    ...context,
    title: t("reports.ledger.title"),
    subtitle: [
      params.accountLabel,
      reportPeriod(context.locale, params.startDate, params.endDate),
    ]
      .filter(Boolean)
      .join("\n"),
    landscape: true,
    summary: [
      [t("reports.ledger.openingBalance"), reportAmount(params.openingBalance)],
      [t("reports.ledger.closingBalance"), reportAmount(params.closingBalance)],
      [t("reports.ledger.entries"), String(params.lines.length)],
    ],
    tables: [
      {
        columns: [
          { header: t("reports.ledger.date"), width: 13 },
          { header: t("reports.ledger.memo"), width: 38 },
          { header: t("reports.ledger.source"), width: 20 },
          amountColumn(t("reports.ledger.debit"), 15),
          amountColumn(t("reports.ledger.credit"), 15),
          amountColumn(t("reports.ledger.balance"), 16),
        ],
        rows: [
          ...params.lines.map((line): ReportRow => {
            const key = ledgerSourceKey(line.source);
            return {
              cells: [
                line.date,
                line.memo || "-",
                key ? t(key) : line.source,
                reportAmount(line.debit),
                reportAmount(line.credit),
                reportAmount(line.balance),
              ],
            };
          }),
          ...(params.lines.length > 0
            ? [
                {
                  cells: [
                    "",
                    t("reports.trialBalance.total"),
                    "",
                    sum((line) => line.debit),
                    sum((line) => line.credit),
                    reportAmount(params.closingBalance),
                  ],
                  kind: "total" as const,
                },
              ]
            : []),
        ],
        empty: t("reports.ledger.empty"),
      },
    ],
  };
}

export function profitLossModel(context: Context, report: ProfitLossReport): ReportModel {
  const t = translator(context.locale);
  const compare = report.compare;
  const cells = (label: string, amount: number, compareAmount: number) => [
    label,
    reportAmount(amount),
    ...(compare ? [reportAmount(compareAmount)] : []),
  ];
  const section = (
    label: string,
    current: ProfitLossSection,
    previous: ProfitLossSection | undefined
  ): ReportRow[] => {
    const previousAmounts = new Map(
      (previous?.accounts ?? []).map((account) => [account.accountId, account])
    );
    const currentIds = new Set(current.accounts.map((account) => account.accountId));
    const accounts = [
      ...current.accounts,
      ...(previous?.accounts ?? [])
        .filter((account) => !currentIds.has(account.accountId))
        .map((account) => ({ ...account, amount: 0 })),
    ];
    return [
      { cells: cells(label, current.total, previous?.total ?? 0), kind: "section" },
      ...accounts.map((account): ReportRow => ({
        cells: cells(
          accountName(account),
          account.amount,
          previousAmounts.get(account.accountId)?.amount ?? 0
        ),
      })),
    ];
  };
  const comparePeriod = report.comparePeriod
    ? `${t("reports.pdf.comparedWith")} ${reportPeriod(
        context.locale,
        report.comparePeriod.startDate,
        report.comparePeriod.endDate
      )}`
    : "";
  return {
    ...context,
    title: t("reports.profitLoss.title"),
    subtitle: [
      reportPeriod(context.locale, report.period.startDate, report.period.endDate),
      comparePeriod,
    ]
      .filter(Boolean)
      .join("\n"),
    tables: [
      {
        columns: [
          { header: t("reports.profitLoss.account"), width: 60 },
          amountColumn(t("reports.profitLoss.amount")),
          ...(compare ? [amountColumn(t("reports.profitLoss.compareAmount"))] : []),
        ],
        rows: [
          ...section(t("reports.profitLoss.revenue"), report.revenue, compare?.revenue),
          ...section(t("reports.profitLoss.cogs"), report.cogs, compare?.cogs),
          {
            cells: cells(
              t("reports.profitLoss.grossProfit"),
              report.grossProfit,
              compare?.grossProfit ?? 0
            ),
            kind: "subtotal",
          },
          ...section(t("reports.profitLoss.expenses"), report.expenses, compare?.expenses),
          {
            cells: cells(
              t("reports.profitLoss.netProfit"),
              report.netProfit,
              compare?.netProfit ?? 0
            ),
            kind: "total",
          },
        ],
      },
    ],
  };
}

export function balanceSheetModel(context: Context, report: BalanceSheetReport): ReportModel {
  const t = translator(context.locale);
  const section = (label: string, data: BalanceSheetSection, totalLabel: string): ReportRow[] => [
    { cells: [label, ""], kind: "section" },
    ...data.accounts.map((account): ReportRow => ({
      cells: [
        account.accountId === CURRENT_EARNINGS_ID
          ? t("reports.balanceSheet.currentEarnings")
          : accountName(account),
        reportAmount(account.amount),
      ],
    })),
    { cells: [totalLabel, reportAmount(data.total)], kind: "subtotal" },
  ];
  const sectionTotal = (label: string) => `${t("reports.trialBalance.total")} ${label}`;
  const assets = t("reports.balanceSheet.assets");
  const liabilities = t("reports.balanceSheet.liabilities");
  const equity = t("reports.balanceSheet.equity");
  return {
    ...context,
    title: t("reports.balanceSheet.title"),
    subtitle: `${t("reports.balanceSheet.asOfDate")} ${inlineDate(context.locale, report.asOfDate)}`,
    tables: [
      {
        columns: [
          { header: t("reports.balanceSheet.account"), width: 70 },
          amountColumn(t("reports.balanceSheet.amount"), 22),
        ],
        rows: [
          ...section(assets, report.assets, t("reports.balanceSheet.totalAssets")),
          ...section(liabilities, report.liabilities, sectionTotal(liabilities)),
          ...section(equity, report.equity, sectionTotal(equity)),
          {
            cells: [
              t("reports.balanceSheet.totalLiabilitiesEquity"),
              reportAmount(report.totals.liabilitiesEquity),
            ],
            kind: "total",
          },
          ...(Math.abs(report.difference) >= 0.01
            ? [
                {
                  cells: [
                    t("reports.balanceSheet.difference"),
                    reportAmount(report.difference),
                  ],
                  kind: "total" as const,
                },
              ]
            : []),
        ],
      },
    ],
  };
}

export function cashFlowModel(context: Context, report: CashFlowReport): ReportModel {
  const t = translator(context.locale);
  const key = (name: string) => t(`reports.cashFlow.${name}`);
  const line = (label: string, amount: number): ReportRow => ({
    cells: [label, reportAmount(amount)],
  });
  return {
    ...context,
    title: key("title"),
    subtitle: reportPeriod(context.locale, report.period.startDate, report.period.endDate),
    summary: [
      [key("openingCash"), reportAmount(report.openingCash)],
      [key("netChange"), reportAmount(report.netCashChange)],
      [key("closingCash"), reportAmount(report.closingCash)],
    ],
    tables: [
      {
        columns: [
          { header: t("reports.pdf.item"), width: 70 },
          amountColumn(t("reports.profitLoss.amount"), 22),
        ],
        rows: [
          { cells: [key("operating"), ""], kind: "section" },
          line(key("netProfit"), report.netProfit),
          line(key("assetChange"), -report.assetChange),
          line(key("liabilityChange"), report.liabilityChange),
          {
            cells: [key("netFromOperations"), reportAmount(report.netCashFromOperations)],
            kind: "subtotal",
          },
          { cells: [key("investing"), ""], kind: "section" },
          {
            cells: [key("netFromInvesting"), reportAmount(report.netCashFromInvesting)],
            kind: "subtotal",
          },
          { cells: [key("financing"), ""], kind: "section" },
          line(key("equityChange"), report.equityChange),
          {
            cells: [key("netFromFinancing"), reportAmount(report.netCashFromFinancing)],
            kind: "subtotal",
          },
          line(key("otherChange"), report.otherChange),
          { cells: [key("netChange"), reportAmount(report.netCashChange)], kind: "total" },
        ],
      },
      {
        heading: key("cashAccounts"),
        columns: [
          { header: key("account"), width: 40 },
          amountColumn(key("openingCash")),
          amountColumn(key("change")),
          amountColumn(key("closingCash")),
        ],
        rows: report.cashAccounts.map((account) => ({
          cells: [
            account.name,
            reportAmount(account.opening),
            reportAmount(account.change),
            reportAmount(account.closing),
          ],
        })),
        empty: key("empty"),
      },
    ],
  };
}

export function vatReturnModel(
  context: Context,
  params: { summary: VatSummary; periodName: string; status: "open" | "filed" }
): ReportModel {
  const t = translator(context.locale);
  const { summary } = params;
  const vatReturn = buildVatReturn(summary);
  const figure = (value: number | null) => (value === null ? "-" : reportAmount(value));
  const boxRow = (box: VatReturnBox): ReportRow => ({
    cells: [String(box.box), t(box.labelKey), figure(box.amount), figure(box.vat)],
    kind: box.isTotal ? "total" : "line",
  });
  const boxColumns: Column[] = [
    { header: t("vatReturn.box"), width: 8, align: "center" },
    { header: t("reports.pdf.item"), width: 52 },
    amountColumn(t("reports.vat.taxable"), 20),
    amountColumn(t("reports.vat.tax"), 20),
  ];
  return {
    ...context,
    title: t("vatReturn.title"),
    subtitle: [
      `${params.periodName} (${t(`reports.vat.status.${params.status}`)})`,
      reportPeriod(context.locale, summary.startDate, summary.endDate),
    ].join("\n"),
    summary: [
      [t("reports.vat.outputVat"), reportAmount(summary.outputVat)],
      [t("reports.vat.inputVat"), reportAmount(summary.inputVat)],
      [t("reports.vat.netVat"), reportAmount(summary.netVat)],
    ],
    tables: [
      { heading: t("vatReturn.salesHeading"), columns: boxColumns, rows: vatReturn.sales.map(boxRow) },
      {
        heading: t("vatReturn.purchasesHeading"),
        columns: boxColumns,
        rows: vatReturn.purchases.map(boxRow),
      },
      {
        heading: t("vatReturn.dueHeading"),
        columns: [boxColumns[0], { ...boxColumns[1], width: 72 }, boxColumns[3]],
        rows: vatReturn.totals.map((box) => ({
          cells: [String(box.box), t(box.labelKey), figure(box.vat)],
          kind: box.isTotal ? ("total" as const) : ("line" as const),
        })),
      },
    ],
    notes: [t("vatReturn.notTracked")],
  };
}

export function hrReportModel(context: Context, report: HrReport): ReportModel {
  const t = translator(context.locale);
  const key = (name: string) => t(`hr.reports.${name}`);
  const nameOf = (entry: { nameAr: string; nameEn: string }) =>
    (context.locale === "ar" ? entry.nameAr || entry.nameEn : entry.nameEn || entry.nameAr) ||
    key("unassigned");
  const count = (header: string): Column => ({ header, width: 14, align: "center" });
  const run = report.payroll.currentRun;

  return {
    ...context,
    title: key("title"),
    subtitle: reportPeriod(context.locale, report.range.startDate, report.range.endDate),
    summary: [
      [key("kpi.headcount"), String(report.kpis.headcount)],
      [key("kpi.active"), String(report.kpis.activeEmployees)],
      [key("kpi.absenteeism"), `${(report.kpis.absenteeismRate * 100).toFixed(1)}%`],
      [key("kpi.overtime"), report.kpis.overtimeHours.toFixed(2)],
      [key("kpi.leaveDays"), report.kpis.leaveDays.toFixed(1)],
      [key("kpi.payrollCost"), reportAmount(report.kpis.payrollCost)],
    ],
    tables: [
      {
        heading: key("employees.byDepartment"),
        columns: [
          { header: key("employees.department"), width: 60 },
          count(key("employees.count")),
        ],
        rows: report.employees.byDepartment.map((entry) => ({
          cells: [nameOf(entry), String(entry.count)],
        })),
      },
      {
        heading: key("employees.byPosition"),
        columns: [
          { header: key("employees.position"), width: 60 },
          count(key("employees.count")),
        ],
        rows: report.employees.byPosition.map((entry) => ({
          cells: [nameOf(entry), String(entry.count)],
        })),
      },
      {
        heading: key("attendance.byEmployee"),
        columns: [
          { header: key("attendance.employee"), width: 36 },
          count(key("attendance.presentDays")),
          count(key("attendance.lateDays")),
          count(key("attendance.absentDays")),
          count(key("attendance.leaveDays")),
          count(key("attendance.overtimeMinutes")),
        ],
        rows: report.attendance.byEmployee.map((entry) => ({
          cells: [
            nameOf(entry),
            String(entry.presentDays),
            String(entry.lateDays),
            String(entry.absentDays),
            String(entry.leaveDays),
            String(entry.overtimeMinutes),
          ],
        })),
      },
      {
        heading: key("leave.balances"),
        columns: [
          { header: key("leave.employee"), width: 36 },
          { header: key("leave.type"), width: 24 },
          count(key("leave.allowance")),
          count(key("leave.used")),
          count(key("leave.remaining")),
        ],
        rows: report.leave.balances.map((entry) => ({
          cells: [
            nameOf(entry),
            entry.leaveTypeName,
            entry.allowance.toFixed(2),
            entry.used.toFixed(2),
            entry.remaining.toFixed(2),
          ],
        })),
      },
      {
        heading: run
          ? `${key("payroll.currentRun")}: ${reportPeriod(context.locale, run.periodStart, run.periodEnd)}`
          : key("payroll.currentRun"),
        columns: [
          { header: key("employees.department"), width: 36 },
          count(key("employees.count")),
          amountColumn(t("reports.pdf.grossPay")),
          amountColumn(t("reports.pdf.deductions")),
          amountColumn(t("reports.pdf.netPay")),
        ],
        rows: run
          ? [
              ...report.payroll.byDepartment.map((entry): ReportRow => ({
                cells: [
                  nameOf(entry),
                  String(entry.employeeCount),
                  reportAmount(entry.grossPay),
                  reportAmount(entry.totalDeductions),
                  reportAmount(entry.netPay),
                ],
              })),
              {
                cells: [
                  t("reports.trialBalance.total"),
                  "",
                  reportAmount(run.totals.grossPay),
                  reportAmount(run.totals.totalDeductions),
                  reportAmount(run.totals.netPay),
                ],
                kind: "total",
              },
            ]
          : [],
        empty: key("payroll.noRun"),
      },
    ],
  };
}
