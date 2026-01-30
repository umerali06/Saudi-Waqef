import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireHrAccess, requireCompanyRole } from "@/lib/access";
import {
  listAttendanceRecords,
  createAttendanceRecord,
} from "@/lib/data/attendance-records";
import { listEmployees } from "@/lib/data/employees";
import { getAttendanceSettings } from "@/lib/data/attendance-settings";
import { listAttendanceHolidays } from "@/lib/data/attendance-holidays";
import { attendanceImportSchema } from "@/lib/validators/attendance";
import { parseCsv, toCsv } from "@/lib/utils/csv";
import { normalizeSearch } from "@/lib/utils/search";
import { computeAttendanceMetrics } from "@/lib/utils/attendance";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

const normalizeHeader = (value: string) =>
  normalizeSearch(value).replace(/[\s_\-.()]/g, "");

const headerAliases: Record<string, string> = {};
const registerAliases = (key: string, aliases: string[]) => {
  aliases.forEach((alias) => {
    headerAliases[normalizeHeader(alias)] = key;
  });
};

registerAliases("employeeId", ["employee id", "employeeId", "\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0648\u0638\u0641"]);
registerAliases("employeeNumber", [
  "employee number",
  "employeeNo",
  "number",
  "\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641",
]);
registerAliases("employeeEmail", ["employee email", "email", "\u0628\u0631\u064A\u062F \u0627\u0644\u0645\u0648\u0638\u0641"]);
registerAliases("date", ["date", "\u0627\u0644\u062A\u0627\u0631\u064A\u062E"]);
registerAliases("checkIn", ["checkin", "check in", "\u062F\u062E\u0648\u0644"]);
registerAliases("checkOut", ["checkout", "check out", "\u062E\u0631\u0648\u062C"]);
registerAliases("status", ["status", "\u0627\u0644\u062D\u0627\u0644\u0629"]);
registerAliases("notes", ["notes", "\u0645\u0644\u0627\u062D\u0638\u0627\u062A"]);

const templateHeaders = {
  en: ["employeeId", "employeeNumber", "employeeEmail", "date", "checkIn", "checkOut", "status", "notes"],
  ar: [
    "\u0645\u0639\u0631\u0641 \u0627\u0644\u0645\u0648\u0638\u0641",
    "\u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641",
    "\u0628\u0631\u064A\u062F \u0627\u0644\u0645\u0648\u0638\u0641",
    "\u0627\u0644\u062A\u0627\u0631\u064A\u062E",
    "\u062F\u062E\u0648\u0644",
    "\u062E\u0631\u0648\u062C",
    "\u0627\u0644\u062D\u0627\u0644\u0629",
    "\u0645\u0644\u0627\u062D\u0638\u0627\u062A",
  ],
};

const statusMap: Record<string, string> = {
  present: "present",
  late: "late",
  absent: "absent",
  leave: "leave",
  holiday: "holiday",
  "\u062D\u0636\u0648\u0631": "present",
  "\u062A\u0623\u062E\u0631": "late",
  "\u063A\u064A\u0627\u0628": "absent",
  "\u0625\u062C\u0627\u0632\u0629": "leave",
  "\u0639\u0637\u0644\u0629": "holiday",
};

type ImportError = {
  row: number;
  field?: string;
  code: string;
};

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

  const lang = searchParams.get("lang") === "ar" ? "ar" : "en";
  const headers = templateHeaders[lang];
  const csv = toCsv(headers, []);
  const filename = lang === "ar" ? "attendance-template-ar.csv" : "attendance-template-en.csv";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = attendanceImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "hr",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { headers, rows } = parseCsv(parsed.data.csv);
  if (headers.length === 0) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  const headerIndex: Record<string, number> = {};
  headers.forEach((header, index) => {
    const alias = headerAliases[normalizeHeader(header)];
    if (alias) {
      headerIndex[alias] = index;
    }
  });

  if (headerIndex.date === undefined) {
    return NextResponse.json({ error: "Missing date column" }, { status: 400 });
  }

  const [employees, records, settings, holidays] = await Promise.all([
    listEmployees(parsed.data.companyId),
    listAttendanceRecords(parsed.data.companyId),
    getAttendanceSettings(parsed.data.companyId),
    listAttendanceHolidays(parsed.data.companyId),
  ]);

  const employeeById = new Map(employees.map((emp) => [emp.id, emp.id]));
  const employeeByNumber = new Map(
    employees
      .filter((emp) => emp.employeeNumber)
      .map((emp) => [normalizeSearch(emp.employeeNumber ?? ""), emp.id])
  );
  const employeeByEmail = new Map(
    employees
      .filter((emp) => emp.email)
      .map((emp) => [normalizeSearch(emp.email ?? ""), emp.id])
  );

  const existingKeys = new Set(records.map((record) => `${record.employeeId}:${record.date}`));
  const createdKeys = new Set<string>();
  const errors: ImportError[] = [];
  let created = 0;

  const getValue = (row: string[], key: string) => {
    const index = headerIndex[key];
    if (index === undefined) {
      return "";
    }
    return row[index] ?? "";
  };

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;

    const date = getValue(row, "date").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ row: rowNumber, field: "date", code: "invalid_date" });
      continue;
    }

    const employeeIdRaw = getValue(row, "employeeId").trim();
    const employeeNumberRaw = normalizeSearch(getValue(row, "employeeNumber"));
    const employeeEmailRaw = normalizeSearch(getValue(row, "employeeEmail"));

    const employeeId =
      (employeeIdRaw && employeeById.get(employeeIdRaw)) ||
      (employeeNumberRaw && employeeByNumber.get(employeeNumberRaw)) ||
      (employeeEmailRaw && employeeByEmail.get(employeeEmailRaw));

    if (!employeeId) {
      errors.push({ row: rowNumber, field: "employeeId", code: "invalid_employee" });
      continue;
    }

    const key = `${employeeId}:${date}`;
    if (existingKeys.has(key) || createdKeys.has(key)) {
      errors.push({ row: rowNumber, field: "date", code: "duplicate_record" });
      continue;
    }

    const checkIn = getValue(row, "checkIn").trim() || null;
    const checkOut = getValue(row, "checkOut").trim() || null;
    const statusRaw = normalizeSearch(getValue(row, "status"));
    const status =
      statusRaw && statusMap[statusRaw] ? statusMap[statusRaw] : undefined;

    const metrics = computeAttendanceMetrics({
      checkIn,
      checkOut,
      shiftStart: settings.shiftStart,
      shiftEnd: settings.shiftEnd,
      graceMinutes: settings.graceMinutes,
      roundingMinutes: settings.roundingMinutes,
      overtimeThresholdMinutes: settings.overtimeThresholdMinutes,
    });

    const isHoliday = holidays.some((holiday) => holiday.date === date);
    const effectiveStatus = status ?? (isHoliday ? "holiday" : metrics.status);

    await createAttendanceRecord({
      companyId: parsed.data.companyId,
      employeeId,
      date,
      checkIn,
      checkOut,
      status: effectiveStatus as "present" | "late" | "absent" | "leave" | "holiday",
      totalMinutes: metrics.totalMinutes,
      overtimeMinutes: metrics.overtimeMinutes,
      lateMinutes: metrics.lateMinutes,
      earlyMinutes: metrics.earlyMinutes,
      source: "import",
      notes: getValue(row, "notes").trim() || null,
      createdBy: user.id,
    });
    created += 1;
    createdKeys.add(key);
  }

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "attendance.import",
    entity: "attendance_record",
    metadata: { created, errors: errors.length },
  });

  return NextResponse.json({ created, errors });
}

