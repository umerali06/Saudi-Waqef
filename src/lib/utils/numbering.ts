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
  /** Next number of every year other than `lastResetYear`. */
  yearCounters?: Record<string, number> | null;
  /** How far past the counter to go when the numbers before it are taken. */
  skip?: number;
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

  const storedNext =
    typeof options.nextNumber === "number" && options.nextNumber > 0
      ? options.nextNumber
      : 1;
  const yearCounters: Record<string, number> = { ...(options.yearCounters ?? {}) };
  const skip = options.skip ?? 0;

  let current = storedNext + skip;
  let nextNumber = current + 1;
  let resetYear = lastResetYear;

  if (resetYearly && lastResetYear === null) {
    resetYear = currentYear;
  } else if (resetYearly && lastResetYear !== null && currentYear > lastResetYear) {
    yearCounters[String(lastResetYear)] = storedNext;
    current = (yearCounters[String(currentYear)] ?? 1) + skip;
    delete yearCounters[String(currentYear)];
    nextNumber = current + 1;
    resetYear = currentYear;
  } else if (resetYearly && lastResetYear !== null && currentYear < lastResetYear) {
    // A backdated document counts in its own year and leaves the running year alone.
    current = (yearCounters[String(currentYear)] ?? 1) + skip;
    yearCounters[String(currentYear)] = current + 1;
    nextNumber = storedNext;
  }

  const padding = typeof options.padding === "number" && options.padding > 0
    ? options.padding
    : 0;
  const numericPart = padding ? String(current).padStart(padding, "0") : String(current);

  return {
    number: `${prefix}${numericPart}${suffix}`,
    nextNumber,
    resetYear,
    yearCounters,
  };
}

/** Whether a settings change would hand out numbers that were already used. */
export function lowersNextNumber(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
) {
  return Object.entries(updates).some(([key, value]) => {
    const stored = current[key];
    return (
      key.endsWith("NextNumber") &&
      typeof value === "number" &&
      typeof stored === "number" &&
      value < stored
    );
  });
}
