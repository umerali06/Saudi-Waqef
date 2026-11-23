import { addDays } from "@/lib/utils/dates";

/** Next run after `date`. Monthly runs keep their day and fall back to the month's last day. */
export function nextRunAfter(
  date: string,
  frequency: "weekly" | "monthly",
  anchorDay: number
) {
  if (frequency === "weekly") {
    return addDays(date, 7);
  }
  const [year, month] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay)));
  return next.toISOString().slice(0, 10);
}
