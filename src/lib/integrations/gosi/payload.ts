const toArray = <T = Record<string, unknown>>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const buildGosiPayload = (basePayload: Record<string, unknown>) => {
  const employeesSection = asObject(basePayload.employees);
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

  const contributionPeriod =
    typeof payrollRun.periodEnd === "string" && payrollRun.periodEnd.length >= 7
      ? payrollRun.periodEnd.slice(0, 7)
      : new Date().toISOString().slice(0, 7);

  const employees = employeeRecords.map((employee) => {
    const employeeId =
      typeof employee.id === "string" && employee.id.trim() ? employee.id.trim() : "";
    const payrollItem = employeeId ? itemsByEmployee.get(employeeId) ?? {} : {};
    return {
      employeeId,
      employeeNumber:
        typeof employee.employeeNumber === "string" ? employee.employeeNumber : null,
      nameAr: typeof employee.nameAr === "string" ? employee.nameAr : null,
      nameEn: typeof employee.nameEn === "string" ? employee.nameEn : null,
      hireDate: typeof employee.hireDate === "string" ? employee.hireDate : null,
      status: typeof employee.status === "string" ? employee.status : "active",
      grossPay: Number(payrollItem.grossPay ?? 0),
      gosiDeduction: Number(payrollItem.gosiDeduction ?? 0),
    };
  });

  return {
    source: "saudi-waqef",
    connector: "gosi",
    companyId: basePayload.companyId ?? null,
    environment: basePayload.environment ?? null,
    triggeredAt: basePayload.triggeredAt ?? new Date().toISOString(),
    contributionPeriod,
    payrollRunId: typeof payrollRun.id === "string" ? payrollRun.id : null,
    employeeCount: employees.length,
    employees,
  };
};

