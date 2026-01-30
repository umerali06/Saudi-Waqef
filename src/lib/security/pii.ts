import type { EmployeeRecord } from "@/lib/data/employees";
import type { Role } from "@/lib/types";

const PRIVILEGED_ROLES: Role[] = ["owner", "admin", "hr"];

export function redactEmployeePII(
  employee: EmployeeRecord,
  role: Role,
  options?: { isSelf?: boolean }
) {
  if (PRIVILEGED_ROLES.includes(role) || options?.isSelf) {
    return employee;
  }

  return {
    ...employee,
    nationalId: null,
    iqamaNumber: null,
    passportNumber: null,
    dob: null,
    email: null,
    phone: null,
    address: null,
    notes: null,
  } as EmployeeRecord;
}
