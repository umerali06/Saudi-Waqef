import { listEmployees } from "@/lib/data/employees";
import { listDepartments } from "@/lib/data/departments";
import { listPositions } from "@/lib/data/positions";
import { listAttendanceRecords } from "@/lib/data/attendance-records";
import { listLeaveTypes } from "@/lib/data/leave-types";
import { listLeaveRequests } from "@/lib/data/leave-requests";
import { listLeaveAdjustments } from "@/lib/data/leave-adjustments";
import { listPayrollRuns } from "@/lib/data/payroll-runs";
import { listPayrollRunItems } from "@/lib/data/payroll-run-items";

const DAY_MS = 1000 * 60 * 60 * 24;

const formatDate = (value: Date) => value.toISOString().slice(0, 10);

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const overlapsRange = (startDate: string, endDate: string, rangeStart: string, rangeEnd: string) =>
  startDate <= rangeEnd && endDate >= rangeStart;

const getOverlapDays = (
  startDate: string,
  endDate: string,
  rangeStart: string,
  rangeEnd: string
) => {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const rangeStartDate = toDate(rangeStart);
  const rangeEndDate = toDate(rangeEnd);
  if (
    [start, end, rangeStartDate, rangeEndDate].some((value) =>
      Number.isNaN(value.getTime())
    )
  ) {
    return 0;
  }
  const overlapStart = start > rangeStartDate ? start : rangeStartDate;
  const overlapEnd = end < rangeEndDate ? end : rangeEndDate;
  if (overlapEnd < overlapStart) {
    return 0;
  }
  const diff = overlapEnd.getTime() - overlapStart.getTime();
  return Math.floor(diff / DAY_MS) + 1;
};

export type HrReportRange = {
  startDate: string;
  endDate: string;
};

export type HrReport = {
  range: HrReportRange;
  kpis: {
    headcount: number;
    activeEmployees: number;
    absenteeismRate: number;
    overtimeHours: number;
    payrollCost: number;
    leaveDays: number;
  };
  employees: {
    byDepartment: Array<{ id: string; nameAr: string; nameEn: string; count: number }>;
    byPosition: Array<{ id: string; nameAr: string; nameEn: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    hires: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      hireDate: string | null;
      departmentId: string | null;
      positionId: string | null;
    }>;
    terminations: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      terminationDate: string | null;
      departmentId: string | null;
      positionId: string | null;
    }>;
  };
  attendance: {
    byEmployee: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      departmentId: string | null;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
      lateMinutes: number;
    }>;
    byDepartment: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
    }>;
  };
  leave: {
    balances: Array<{
      employeeId: string;
      nameAr: string;
      nameEn: string;
      leaveTypeId: string;
      leaveTypeName: string;
      allowance: number;
      adjustments: number;
      used: number;
      remaining: number;
    }>;
    usageByType: Array<{ leaveTypeId: string; leaveTypeName: string; used: number }>;
    pendingRequests: Array<{
      id: string;
      employeeId: string;
      nameAr: string;
      nameEn: string;
      leaveTypeId: string;
      leaveTypeName: string;
      startDate: string;
      endDate: string;
      days: number;
      status: string;
    }>;
  };
  payroll: {
    currentRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      status: string;
      totals: { grossPay: number; totalDeductions: number; netPay: number };
    } | null;
    previousRun: {
      id: string;
      periodStart: string;
      periodEnd: string;
      totals: { grossPay: number; totalDeductions: number; netPay: number };
    } | null;
    variance: { gross: number; deductions: number; net: number } | null;
    byDepartment: Array<{
      id: string;
      nameAr: string;
      nameEn: string;
      grossPay: number;
      totalDeductions: number;
      netPay: number;
      employeeCount: number;
    }>;
    netDistribution: Array<{ range: string; count: number; total: number }>;
  };
};

export async function buildHrReport(params: {
  companyId: string;
  startDate?: string | null;
  endDate?: string | null;
  departmentId?: string | null;
}): Promise<HrReport> {
  const today = new Date();
  const fallbackEnd = formatDate(today);
  const fallbackStart = formatDate(new Date(today.getTime() - 30 * DAY_MS));

  const startDate = params.startDate && isValidDate(params.startDate)
    ? params.startDate
    : fallbackStart;
  const endDate = params.endDate && isValidDate(params.endDate) ? params.endDate : fallbackEnd;

  const [
    employeesAll,
    departments,
    positions,
    attendanceRecords,
    leaveTypesAll,
    leaveRequests,
    leaveAdjustments,
    payrollRuns,
  ] = await Promise.all([
    listEmployees(params.companyId),
    listDepartments(params.companyId),
    listPositions(params.companyId),
    listAttendanceRecords(params.companyId),
    listLeaveTypes(params.companyId),
    listLeaveRequests(params.companyId),
    listLeaveAdjustments(params.companyId),
    listPayrollRuns(params.companyId),
  ]);

  const employees = params.departmentId
    ? employeesAll.filter((employee) => employee.departmentId === params.departmentId)
    : employeesAll;

  const employeeById = new Map(employeesAll.map((employee) => [employee.id, employee]));
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const positionById = new Map(positions.map((position) => [position.id, position]));

  const byDepartmentMap = new Map<
    string,
    { id: string; nameAr: string; nameEn: string; count: number }
  >();
  employees.forEach((employee) => {
    const departmentId = employee.departmentId ?? "unassigned";
    const department = departmentById.get(departmentId);
    const entry =
      byDepartmentMap.get(departmentId) ?? {
        id: departmentId,
        nameAr: department?.nameAr ?? "بدون قسم",
        nameEn: department?.nameEn ?? "Unassigned",
        count: 0,
      };
    entry.count += 1;
    byDepartmentMap.set(departmentId, entry);
  });

  const byPositionMap = new Map<
    string,
    { id: string; nameAr: string; nameEn: string; count: number }
  >();
  employees.forEach((employee) => {
    const positionId = employee.positionId ?? "unassigned";
    const position = positionById.get(positionId);
    const entry =
      byPositionMap.get(positionId) ?? {
        id: positionId,
        nameAr: position?.nameAr ?? "غير محدد",
        nameEn: position?.nameEn ?? "Unassigned",
        count: 0,
      };
    entry.count += 1;
    byPositionMap.set(positionId, entry);
  });

  const byStatusMap = new Map<string, number>();
  employees.forEach((employee) => {
    const status = employee.status ?? "active";
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1);
  });

  const hires = employees
    .filter((employee) => employee.hireDate && employee.hireDate >= startDate && employee.hireDate <= endDate)
    .map((employee) => ({
      id: employee.id,
      nameAr: employee.nameAr,
      nameEn: employee.nameEn,
      hireDate: employee.hireDate ?? null,
      departmentId: employee.departmentId ?? null,
      positionId: employee.positionId ?? null,
    }));

  const terminations = employees
    .filter(
      (employee) =>
        employee.terminationDate &&
        employee.terminationDate >= startDate &&
        employee.terminationDate <= endDate
    )
    .map((employee) => ({
      id: employee.id,
      nameAr: employee.nameAr,
      nameEn: employee.nameEn,
      terminationDate: employee.terminationDate ?? null,
      departmentId: employee.departmentId ?? null,
      positionId: employee.positionId ?? null,
    }));

  const attendanceInRange = attendanceRecords.filter(
    (record) =>
      record.date >= startDate &&
      record.date <= endDate &&
      (params.departmentId ? employeeById.get(record.employeeId)?.departmentId === params.departmentId : true)
  );

  const attendanceByEmployeeMap = new Map<
    string,
    {
      id: string;
      nameAr: string;
      nameEn: string;
      departmentId: string | null;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
      lateMinutes: number;
    }
  >();

  attendanceInRange.forEach((record) => {
    const employee = employeeById.get(record.employeeId);
    if (!employee) {
      return;
    }
    const entry =
      attendanceByEmployeeMap.get(employee.id) ?? {
        id: employee.id,
        nameAr: employee.nameAr,
        nameEn: employee.nameEn,
        departmentId: employee.departmentId ?? null,
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        leaveDays: 0,
        overtimeMinutes: 0,
        lateMinutes: 0,
      };
    if (record.status === "present") {
      entry.presentDays += 1;
    } else if (record.status === "late") {
      entry.lateDays += 1;
    } else if (record.status === "absent") {
      entry.absentDays += 1;
    } else if (record.status === "leave") {
      entry.leaveDays += 1;
    }
    entry.overtimeMinutes += record.overtimeMinutes ?? 0;
    entry.lateMinutes += record.lateMinutes ?? 0;
    attendanceByEmployeeMap.set(employee.id, entry);
  });

  const attendanceByDepartmentMap = new Map<
    string,
    {
      id: string;
      nameAr: string;
      nameEn: string;
      presentDays: number;
      lateDays: number;
      absentDays: number;
      leaveDays: number;
      overtimeMinutes: number;
    }
  >();

  attendanceByEmployeeMap.forEach((entry) => {
    const departmentId = entry.departmentId ?? "unassigned";
    const department = departmentById.get(departmentId);
    const deptEntry =
      attendanceByDepartmentMap.get(departmentId) ?? {
        id: departmentId,
        nameAr: department?.nameAr ?? "بدون قسم",
        nameEn: department?.nameEn ?? "Unassigned",
        presentDays: 0,
        lateDays: 0,
        absentDays: 0,
        leaveDays: 0,
        overtimeMinutes: 0,
      };
    deptEntry.presentDays += entry.presentDays;
    deptEntry.lateDays += entry.lateDays;
    deptEntry.absentDays += entry.absentDays;
    deptEntry.leaveDays += entry.leaveDays;
    deptEntry.overtimeMinutes += entry.overtimeMinutes;
    attendanceByDepartmentMap.set(departmentId, deptEntry);
  });

  const leaveTypes = leaveTypesAll.filter((type) => type.status === "active");
  const approvedLeaveRequests = leaveRequests.filter(
    (request) =>
      request.status === "approved" && overlapsRange(request.startDate, request.endDate, startDate, endDate)
  );

  const leaveUsageByTypeMap = new Map<string, { leaveTypeId: string; leaveTypeName: string; used: number }>();
  const leaveUsageByEmployeeType = new Map<string, number>();

  approvedLeaveRequests.forEach((request) => {
    const employee = employeeById.get(request.employeeId);
    if (!employee) {
      return;
    }
    if (params.departmentId && employee.departmentId !== params.departmentId) {
      return;
    }
    const type = leaveTypes.find((entry) => entry.id === request.leaveTypeId);
    if (!type) {
      return;
    }
    const usedDays = getOverlapDays(request.startDate, request.endDate, startDate, endDate);
    const typeEntry =
      leaveUsageByTypeMap.get(type.id) ?? {
        leaveTypeId: type.id,
        leaveTypeName: type.name,
        used: 0,
      };
    typeEntry.used += usedDays;
    leaveUsageByTypeMap.set(type.id, typeEntry);

    const key = `${request.employeeId}:${request.leaveTypeId}`;
    leaveUsageByEmployeeType.set(key, (leaveUsageByEmployeeType.get(key) ?? 0) + usedDays);
  });

  const leaveAdjustmentsByKey = new Map<string, number>();
  leaveAdjustments.forEach((adjustment) => {
    const employee = employeeById.get(adjustment.employeeId);
    if (!employee) {
      return;
    }
    if (params.departmentId && employee.departmentId !== params.departmentId) {
      return;
    }
    const key = `${adjustment.employeeId}:${adjustment.leaveTypeId}`;
    leaveAdjustmentsByKey.set(key, (leaveAdjustmentsByKey.get(key) ?? 0) + adjustment.amount);
  });

  const leaveBalances = employees.flatMap((employee) =>
    leaveTypes.map((leaveType) => {
      const key = `${employee.id}:${leaveType.id}`;
      const adjustments = leaveAdjustmentsByKey.get(key) ?? 0;
      const used = leaveUsageByEmployeeType.get(key) ?? 0;
      const allowance = leaveType.defaultAllowance ?? 0;
      return {
        employeeId: employee.id,
        nameAr: employee.nameAr,
        nameEn: employee.nameEn,
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        allowance,
        adjustments,
        used,
        remaining: allowance + adjustments - used,
      };
    })
  );

  const pendingRequests = leaveRequests
    .filter(
      (request) =>
        request.status === "pending" &&
        overlapsRange(request.startDate, request.endDate, startDate, endDate)
    )
    .map((request) => {
      const employee = employeeById.get(request.employeeId);
      const type = leaveTypes.find((entry) => entry.id === request.leaveTypeId);
      return {
        id: request.id,
        employeeId: request.employeeId,
        nameAr: employee?.nameAr ?? "",
        nameEn: employee?.nameEn ?? "",
        leaveTypeId: request.leaveTypeId,
        leaveTypeName: type?.name ?? "",
        startDate: request.startDate,
        endDate: request.endDate,
        days: request.days ?? 0,
        status: request.status,
      };
    });

  const runsSorted = [...payrollRuns].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const currentRun =
    runsSorted.find((run) => run.periodEnd >= startDate && run.periodEnd <= endDate) ??
    runsSorted.find((run) => run.periodEnd <= endDate) ??
    null;
  const previousRun = currentRun
    ? runsSorted.find((run) => run.periodEnd < currentRun.periodEnd) ?? null
    : null;

  let payrollByDepartment: HrReport["payroll"]["byDepartment"] = [];
  let netDistribution: HrReport["payroll"]["netDistribution"] = [];

  if (currentRun) {
    const items = await listPayrollRunItems(currentRun.id);
    const departmentMap = new Map<
      string,
      {
        id: string;
        nameAr: string;
        nameEn: string;
        grossPay: number;
        totalDeductions: number;
        netPay: number;
        employeeCount: number;
      }
    >();

    items.forEach((item) => {
      const employee = employeeById.get(item.employeeId);
      if (!employee) {
        return;
      }
      if (params.departmentId && employee.departmentId !== params.departmentId) {
        return;
      }
      const departmentId = employee.departmentId ?? "unassigned";
      const department = departmentById.get(departmentId);
      const entry =
        departmentMap.get(departmentId) ?? {
          id: departmentId,
          nameAr: department?.nameAr ?? "بدون قسم",
          nameEn: department?.nameEn ?? "Unassigned",
          grossPay: 0,
          totalDeductions: 0,
          netPay: 0,
          employeeCount: 0,
        };
      entry.grossPay += item.grossPay;
      entry.totalDeductions += item.totalDeductions;
      entry.netPay += item.netPay;
      entry.employeeCount += 1;
      departmentMap.set(departmentId, entry);
    });
    payrollByDepartment = Array.from(departmentMap.values()).sort((a, b) =>
      a.nameEn.localeCompare(b.nameEn)
    );

    const buckets = [
      { min: 0, max: 5000, label: "0-5k" },
      { min: 5000, max: 10000, label: "5k-10k" },
      { min: 10000, max: 20000, label: "10k-20k" },
      { min: 20000, max: Number.POSITIVE_INFINITY, label: "20k+" },
    ];
    const bucketMap = new Map<string, { range: string; count: number; total: number }>();
    buckets.forEach((bucket) => {
      bucketMap.set(bucket.label, { range: bucket.label, count: 0, total: 0 });
    });

    items.forEach((item) => {
      const bucket =
        buckets.find((entry) => item.netPay >= entry.min && item.netPay < entry.max) ??
        buckets[buckets.length - 1];
      const entry = bucketMap.get(bucket.label)!;
      entry.count += 1;
      entry.total += item.netPay;
    });
    netDistribution = Array.from(bucketMap.values());
  }

  const totalAttendanceTracked = Array.from(attendanceByEmployeeMap.values()).reduce(
    (sum, entry) =>
      sum + entry.presentDays + entry.lateDays + entry.absentDays + entry.leaveDays,
    0
  );
  const totalAbsentDays = Array.from(attendanceByEmployeeMap.values()).reduce(
    (sum, entry) => sum + entry.absentDays,
    0
  );
  const totalOvertimeMinutes = Array.from(attendanceByEmployeeMap.values()).reduce(
    (sum, entry) => sum + entry.overtimeMinutes,
    0
  );
  const totalLeaveDays = Array.from(leaveUsageByTypeMap.values()).reduce(
    (sum, entry) => sum + entry.used,
    0
  );

  const payrollCost = currentRun?.totals?.netPay ?? 0;
  const absenteeismRate =
    totalAttendanceTracked > 0 ? totalAbsentDays / totalAttendanceTracked : 0;

  return {
    range: { startDate, endDate },
    kpis: {
      headcount: employees.length,
      activeEmployees: employees.filter((employee) => employee.status === "active").length,
      absenteeismRate,
      overtimeHours: Number((totalOvertimeMinutes / 60).toFixed(2)),
      payrollCost,
      leaveDays: totalLeaveDays,
    },
    employees: {
      byDepartment: Array.from(byDepartmentMap.values()).sort((a, b) =>
        a.nameEn.localeCompare(b.nameEn)
      ),
      byPosition: Array.from(byPositionMap.values()).sort((a, b) =>
        a.nameEn.localeCompare(b.nameEn)
      ),
      byStatus: Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count })),
      hires,
      terminations,
    },
    attendance: {
      byEmployee: Array.from(attendanceByEmployeeMap.values()).sort((a, b) =>
        a.nameEn.localeCompare(b.nameEn)
      ),
      byDepartment: Array.from(attendanceByDepartmentMap.values()).sort((a, b) =>
        a.nameEn.localeCompare(b.nameEn)
      ),
    },
    leave: {
      balances: leaveBalances,
      usageByType: Array.from(leaveUsageByTypeMap.values()).sort((a, b) =>
        a.leaveTypeName.localeCompare(b.leaveTypeName)
      ),
      pendingRequests,
    },
    payroll: {
      currentRun: currentRun
        ? {
            id: currentRun.id,
            periodStart: currentRun.periodStart,
            periodEnd: currentRun.periodEnd,
            status: currentRun.status,
            totals: currentRun.totals,
          }
        : null,
      previousRun: previousRun
        ? {
            id: previousRun.id,
            periodStart: previousRun.periodStart,
            periodEnd: previousRun.periodEnd,
            totals: previousRun.totals,
          }
        : null,
      variance: currentRun && previousRun
        ? {
            gross: currentRun.totals.grossPay - previousRun.totals.grossPay,
            deductions:
              currentRun.totals.totalDeductions - previousRun.totals.totalDeductions,
            net: currentRun.totals.netPay - previousRun.totals.netPay,
          }
        : null,
      byDepartment: payrollByDepartment,
      netDistribution,
    },
  };
}
