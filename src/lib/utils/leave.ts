export const calculateLeaveDays = (startDate: string, endDate: string) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }
  const diff = end.getTime() - start.getTime();
  if (diff < 0) {
    return 0;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
  return days;
};

export const isDateInYear = (date: string, year: number) => {
  return date.startsWith(`${year}-`);
};
