export type PeriodFrequency = "monthly" | "quarterly";

export type PeriodDraft = {
  name: string;
  startDate: string;
  endDate: string;
  frequency: PeriodFrequency;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export function buildMonthlyPeriods(year: number): PeriodDraft[] {
  const periods: PeriodDraft[] = [];
  for (let month = 0; month < 12; month += 1) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    periods.push({
      name: `${year}-${String(month + 1).padStart(2, "0")}`,
      startDate: formatDate(start),
      endDate: formatDate(end),
      frequency: "monthly",
    });
  }
  return periods;
}

export function buildQuarterlyPeriods(year: number): PeriodDraft[] {
  const periods: PeriodDraft[] = [];
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const startMonth = quarter * 3;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, startMonth + 3, 0));
    periods.push({
      name: `${year}-Q${quarter + 1}`,
      startDate: formatDate(start),
      endDate: formatDate(end),
      frequency: "quarterly",
    });
  }
  return periods;
}

export function isDateWithinRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate;
}

export function periodsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  return startA <= endB && startB <= endA;
}
