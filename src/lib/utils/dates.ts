export function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) {
    return dateValue;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

