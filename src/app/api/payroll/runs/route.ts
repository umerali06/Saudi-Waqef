import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import { listEmployees } from "@/lib/data/employees";
import { listEmployeeContracts } from "@/lib/data/employee-contracts";
import { listAttendanceRecords } from "@/lib/data/attendance-records";
import { getAttendanceSettings } from "@/lib/data/attendance-settings";
import { listLeaveRequests } from "@/lib/data/leave-requests";
import { listLeaveTypes } from "@/lib/data/leave-types";
import {
  createPayrollRun,
  listPayrollRuns,
} from "@/lib/data/payroll-runs";
import { createPayrollRunItem } from "@/lib/data/payroll-run-items";
import { getPayrollSettings } from "@/lib/data/payroll-settings";
import { payrollRunCreateSchema } from "@/lib/validators/payroll";
import { computePayrollForEmployee } from "@/lib/utils/payroll";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { createTelemetryEvent } from "@/lib/data/telemetry";

export const runtime = "nodejs";

const isDateInRange = (date: string, start: string, end: string) =>
  date >= start && date <= end;

const pickActiveContract = (contracts: Awaited<ReturnType<typeof listEmployeeContracts>>) =>
  contracts.find((contract) => contract.status === "active") ?? contracts[0] ?? null;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireHrAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runs = await listPayrollRuns(companyId);
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payrollRunCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.periodStart > parsed.data.periodEnd) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existingRuns = await listPayrollRuns(parsed.data.companyId);
  const duplicate = existingRuns.find(
    (run) =>
      run.periodStart === parsed.data.periodStart &&
      run.periodEnd === parsed.data.periodEnd
  );
  if (duplicate) {
    return NextResponse.json({ error: "Payroll run exists" }, { status: 409 });
  }

  const [settings, attendanceSettings, employees, attendanceRecords, leaveRequests, leaveTypes] =
    await Promise.all([
      getPayrollSettings(parsed.data.companyId),
      getAttendanceSettings(parsed.data.companyId),
      listEmployees(parsed.data.companyId),
      listAttendanceRecords(parsed.data.companyId),
      listLeaveRequests(parsed.data.companyId),
      listLeaveTypes(parsed.data.companyId),
    ]);

  const employeeFilter = parsed.data.employeeIds?.length
    ? new Set(parsed.data.employeeIds)
    : null;
  const eligibleEmployees = employees.filter((employee) => {
    if (employee.status !== "active") {
      return false;
    }
    if (employeeFilter && !employeeFilter.has(employee.id)) {
      return false;
    }
    return true;
  });

  const items = [];
  for (const employee of eligibleEmployees) {
    const contracts = await listEmployeeContracts(employee.id);
    const contract = pickActiveContract(contracts);
    if (!contract || contract.companyId !== parsed.data.companyId) {
      continue;
    }

    const employeeAttendance = attendanceRecords.filter(
      (record) =>
        record.employeeId === employee.id &&
        isDateInRange(record.date, parsed.data.periodStart, parsed.data.periodEnd)
    );
    const employeeLeaves = leaveRequests.filter(
      (request) =>
        request.employeeId === employee.id &&
        request.startDate <= parsed.data.periodEnd &&
        request.endDate >= parsed.data.periodStart
    );

    const computed = computePayrollForEmployee({
      contract,
      attendanceRecords: employeeAttendance,
      leaveRequests: employeeLeaves,
      leaveTypes,
      attendanceSettings,
      payrollSettings: settings,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
    });

    items.push({
      companyId: parsed.data.companyId,
      employeeId: employee.id,
      contractId: contract.id,
      currency: computed.currency,
      baseSalary: computed.baseSalary,
      allowances: computed.allowances,
      fixedDeductions: computed.fixedDeductions,
      overtimePay: computed.overtimePay,
      latenessDeduction: computed.latenessDeduction,
      unpaidLeaveDeduction: computed.unpaidLeaveDeduction,
      absenceDeduction: computed.absenceDeduction,
      gosiDeduction: computed.gosiDeduction,
      incomeTaxDeduction: computed.incomeTaxDeduction,
      statutoryDeduction: computed.statutoryDeduction,
      adjustmentsTotal: 0,
      grossPay: computed.grossPay,
      totalDeductions: computed.totalDeductions,
      netPay: computed.netPay,
      overtimeMinutes: computed.overtimeMinutes,
      lateMinutes: computed.lateMinutes,
      absentDays: computed.absentDays,
      unpaidLeaveDays: computed.unpaidLeaveDays,
      leaveDays: computed.leaveDays,
      totalMinutes: computed.totalMinutes,
      prorationFactor: computed.prorationFactor,
      activeDays: computed.activeDays,
    });
  }

  if (items.length === 0) {
    return NextResponse.json({ error: "No eligible employees" }, { status: 400 });
  }

  const totals = items.reduce(
    (acc, item) => {
      acc.grossPay += item.grossPay;
      acc.totalDeductions += item.totalDeductions;
      acc.netPay += item.netPay;
      acc.employeeCount += 1;
      return acc;
    },
    { grossPay: 0, totalDeductions: 0, netPay: 0, employeeCount: 0 }
  );

  const runId = await createPayrollRun({
    companyId: parsed.data.companyId,
    periodStart: parsed.data.periodStart,
    periodEnd: parsed.data.periodEnd,
    totals,
    createdBy: user.id,
  });

  await Promise.all(
    items.map((item) =>
      createPayrollRunItem({
        ...item,
        runId,
        companyId: parsed.data.companyId,
      })
    )
  );

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "payroll.run.create",
    entity: "payroll_run",
    entityId: runId,
    metadata: { periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd },
  });

  await createTelemetryEvent({
    name: "payroll.run.created",
    companyId: parsed.data.companyId,
    userId: user.id,
    metadata: { periodStart: parsed.data.periodStart, periodEnd: parsed.data.periodEnd },
  });

  return NextResponse.json({ runId, totals });
}

