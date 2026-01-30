export type NumberingTokens = {
  year: string;
  shortYear: string;
  month: string;
  day: string;
};

export type NumberingOptions = {
  prefix?: string | null;
  suffix?: string | null;
  nextNumber?: number | null;
  padding?: number | null;
  resetYearly?: boolean | null;
  lastResetYear?: number | null;
  date?: string | null;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toTokens = (date?: string | null): NumberingTokens => {
  const now = new Date();
  const value = date && DATE_REGEX.test(date) ? new Date(`${date}T00:00:00Z`) : now;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return {
    year: String(year),
    shortYear: String(year).slice(-2),
    month,
    day,
  };
};

const applyTokens = (value: string, tokens: NumberingTokens) =>
  value
    .replace(/\{YYYY\}/g, tokens.year)
    .replace(/\{YY\}/g, tokens.shortYear)
    .replace(/\{MM\}/g, tokens.month)
    .replace(/\{DD\}/g, tokens.day);

export function buildSequenceNumber(options: NumberingOptions) {
  const tokens = toTokens(options.date ?? undefined);
  const prefix = options.prefix ? applyTokens(options.prefix, tokens) : "";
  const suffix = options.suffix ? applyTokens(options.suffix, tokens) : "";
  const resetYearly = Boolean(options.resetYearly);
  const lastResetYear = options.lastResetYear ?? null;
  const currentYear = Number(tokens.year);

  let nextNumber = typeof options.nextNumber === "number" && options.nextNumber > 0
    ? options.nextNumber
    : 1;
  let resetYear = lastResetYear;

  if (resetYearly && lastResetYear !== currentYear) {
    nextNumber = 1;
    resetYear = currentYear;
  }

  const padding = typeof options.padding === "number" && options.padding > 0
    ? options.padding
    : 0;
  const numericPart = padding ? String(nextNumber).padStart(padding, "0") : String(nextNumber);

  return {
    number: `${prefix}${numericPart}${suffix}`,
    nextNumber: nextNumber + 1,
    resetYear,
  };
}
