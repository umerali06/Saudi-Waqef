export type DocumentDateFormat = "yyyy-MM-dd" | "dd/MM/yyyy" | "MM/dd/yyyy";

/** A YYYY-MM-DD date in the company's chosen document format. */
export function formatDocumentDate(value: string, format: DocumentDateFormat) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const [, year, month, day] = match;
  if (format === "dd/MM/yyyy") {
    return `${day}/${month}/${year}`;
  }
  return format === "MM/dd/yyyy" ? `${month}/${day}/${year}` : value;
}
