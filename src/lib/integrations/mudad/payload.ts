const toArray = <T = Record<string, unknown>>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const buildMudadPayload = (basePayload: Record<string, unknown>) => {
  const employeesSection = asObject(basePayload.employees);
  const attendanceSection = asObject(basePayload.attendance);
  const payrollSection = asObject(basePayload.payroll);
  const payrollRun = asObject(payrollSection.run);
  const payrollItems = toArray<Record<string, unknown>>(payrollSection.items);
  const employeeRecords = toArray<Record<string, unknown>>(employeesSection.records);

  const itemsByEmployee = new Map<string, Record<string, unknown>>();
  payrollItems.forEach((item) => {
    const employeeId =
      typeof item.employeeId === "string" && item.employeeId.trim() ? item.employeeId.trim() : "";
    if (employeeId) {
      itemsByEmployee.set(employeeId, item);
    }
  });

  const workers = employeeRecords.map((employee) => {
    const employeeId =
      typeof employee.id === "string" && employee.id.trim() ? employee.id.trim() : "";
    const payrollItem = employeeId ? itemsByEmployee.get(employeeId) ?? {} : {};
    return {
      employeeId,
      employeeNumber:
        typeof employee.employeeNumber === "string" ? employee.employeeNumber : null,
      nameAr: typeof employee.nameAr === "string" ? employee.nameAr : null,
      nameEn: typeof employee.nameEn === "string" ? employee.nameEn : null,
      status: typeof employee.status === "string" ? employee.status : "active",
      netPay: Number(payrollItem.netPay ?? 0),
      grossPay: Number(payrollItem.grossPay ?? 0),
      totalDeductions: Number(payrollItem.totalDeductions ?? 0),
      unpaidLeaveDeduction: Number(payrollItem.unpaidLeaveDeduction ?? 0),
      absenceDeduction: Number(payrollItem.absenceDeduction ?? 0),
    };
  });

  return {
    source: "saudi-waqef",
    connector: "mudad",
    companyId: basePayload.companyId ?? null,
    environment: basePayload.environment ?? null,
    triggeredAt: basePayload.triggeredAt ?? new Date().toISOString(),
    payrollRun: {
      id: typeof payrollRun.id === "string" ? payrollRun.id : null,
      periodStart: typeof payrollRun.periodStart === "string" ? payrollRun.periodStart : null,
      periodEnd: typeof payrollRun.periodEnd === "string" ? payrollRun.periodEnd : null,
    },
    attendanceSummary: {
      windowStart:
        typeof attendanceSection.windowStart === "string" ? attendanceSection.windowStart : null,
      totalRecords: Number(attendanceSection.totalRecords ?? 0),
      absences: Number(attendanceSection.absences ?? 0),
      lateRecords: Number(attendanceSection.lateRecords ?? 0),
      overtimeMinutes: Number(attendanceSection.overtimeMinutes ?? 0),
    },
    workerCount: workers.length,
    workers,
  };
};

