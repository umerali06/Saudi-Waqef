export type BillingCycle = "monthly" | "yearly";

export function addMonths(base: Date, months: number) {
  const date = new Date(base);
  const targetMonth = date.getMonth() + months;
  date.setMonth(targetMonth);
  if (date.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    date.setDate(0);
  }
  return date;
}

export function addYears(base: Date, years: number) {
  const date = new Date(base);
  date.setFullYear(date.getFullYear() + years);
  return date;
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function buildBillingPeriod(startDate: Date, cycle: BillingCycle) {
  const endDate = cycle === "yearly" ? addYears(startDate, 1) : addMonths(startDate, 1);
  return {
    startDate: toIsoDate(startDate),
    endDate: toIsoDate(endDate),
  };
}

export function calculatePlanAmount(params: {
  priceMonthly: number;
  priceYearly: number;
  billingCycle: BillingCycle;
}) {
  return params.billingCycle === "yearly" ? params.priceYearly : params.priceMonthly;
}
