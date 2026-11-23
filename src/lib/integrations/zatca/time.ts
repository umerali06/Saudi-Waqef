const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // Saudi Arabia observes no daylight saving.

/** Local Saudi date and time. ZATCA compares IssueDate/IssueTime to Riyadh time. */
export const riyadhDateTime = (instant: Date) => {
  const local = new Date(instant.getTime() + RIYADH_OFFSET_MS).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 19) };
};

/** The instant a Saudi local date/time refers to. */
export const fromRiyadh = (date: string, time: string) => new Date(`${date}T${time}+03:00`);

/**
 * Issue time for a document: the moment it was approved when that happened on
 * its issue date, otherwise noon of the issue date (the books hold no time).
 */
export const resolveIssueTime = (issueDate: string, approvedAt?: string | null) => {
  if (approvedAt) {
    const approved = new Date(approvedAt);
    if (!Number.isNaN(approved.getTime())) {
      const local = riyadhDateTime(approved);
      if (local.date === issueDate) return local.time;
    }
  }
  return "12:00:00";
};
