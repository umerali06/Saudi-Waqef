const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Saudi Arabia as YYYY-MM-DD, whatever time zone the server runs in. */
export const riyadhDate = (date: Date = new Date()) => formatter.format(date);

export const riyadhYear = (date: Date = new Date()) => Number(riyadhDate(date).slice(0, 4));
