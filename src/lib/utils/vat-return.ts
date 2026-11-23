import type { VatSummary } from "@/lib/utils/vat-report";
import { roundMoney } from "@/lib/utils/invoice";

export type VatReturnBox = {
  box: number;
  /** Message key of the box name. */
  labelKey: string;
  /** Null when the system does not record this kind of transaction. */
  amount: number | null;
  vat: number | null;
  isTotal?: boolean;
};

export type VatReturn = {
  sales: VatReturnBox[];
  purchases: VatReturnBox[];
  totals: VatReturnBox[];
};

const sumOf = (
  entries: VatSummary["breakdown"]["sales"],
  matches: (entry: VatSummary["breakdown"]["sales"][number]) => boolean
) => {
  const selected = entries.filter(matches);
  return {
    amount: roundMoney(selected.reduce((sum, entry) => sum + entry.taxableAmount, 0)),
    vat: roundMoney(selected.reduce((sum, entry) => sum + entry.taxAmount, 0)),
  };
};

/** The summary laid out in the boxes of ZATCA's VAT return form. */
export function buildVatReturn(summary: VatSummary): VatReturn {
  const { sales, purchases } = summary.breakdown;
  const isStandard = (entry: { rate: number }) => entry.rate > 0;
  const isExempt = (entry: { rate: number; type: string }) =>
    entry.rate === 0 && entry.type === "exempt";
  const isZero = (entry: { rate: number; type: string }) =>
    entry.rate === 0 && entry.type !== "exempt";

  const exportsAmount = summary.exports ?? 0;
  const citizens = summary.citizenServices ?? 0;
  const zeroSales = sumOf(sales, isZero);

  return {
    sales: [
      { box: 1, labelKey: "vatReturn.standardSales", ...sumOf(sales, isStandard) },
      { box: 2, labelKey: "vatReturn.citizenServices", amount: citizens, vat: 0 },
      {
        box: 3,
        labelKey: "vatReturn.zeroRatedSales",
        amount: roundMoney(zeroSales.amount - exportsAmount - citizens),
        vat: 0,
      },
      { box: 4, labelKey: "vatReturn.exports", amount: exportsAmount, vat: 0 },
      { box: 5, labelKey: "vatReturn.exemptSales", ...sumOf(sales, isExempt) },
      {
        box: 6,
        labelKey: "vatReturn.totalSales",
        amount: summary.sales.netAmount,
        vat: summary.sales.taxAmount,
        isTotal: true,
      },
    ],
    purchases: [
      { box: 7, labelKey: "vatReturn.standardPurchases", ...sumOf(purchases, isStandard) },
      { box: 8, labelKey: "vatReturn.customsImports", amount: null, vat: null },
      { box: 9, labelKey: "vatReturn.reverseChargeImports", amount: null, vat: null },
      { box: 10, labelKey: "vatReturn.zeroRatedPurchases", ...sumOf(purchases, isZero) },
      { box: 11, labelKey: "vatReturn.exemptPurchases", ...sumOf(purchases, isExempt) },
      {
        box: 12,
        labelKey: "vatReturn.totalPurchases",
        amount: summary.purchases.netAmount,
        vat: summary.purchases.taxAmount,
        isTotal: true,
      },
    ],
    totals: [
      {
        box: 13,
        labelKey: "vatReturn.currentVat",
        amount: null,
        vat: roundMoney(summary.sales.taxAmount - summary.purchases.taxAmount),
      },
      {
        box: 14,
        labelKey: "vatReturn.corrections",
        amount: null,
        vat: summary.adjustments.net,
      },
      { box: 15, labelKey: "vatReturn.carriedForward", amount: null, vat: null },
      {
        box: 16,
        labelKey: "vatReturn.netVat",
        amount: null,
        vat: summary.netVat,
        isTotal: true,
      },
    ],
  };
}
