
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  employeeNumber?: string | null;
  email?: string | null;
  status?: string;
};

type AttendanceSettings = {
  shiftStart: string;
  shiftEnd: string;
  weekendDays: number[];
  graceMinutes: number;
  roundingMinutes: number;
  overtimeThresholdMinutes: number;
};

type AttendanceHoliday = {
  id: string;
  name: string;
  date: string;
  isPaid?: boolean;
};

type AttendanceRecord = {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: "present" | "late" | "absent" | "leave" | "holiday";
  totalMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  source: "manual" | "import" | "self";
  notes?: string | null;
};

type AttendanceSummary = {
  totals: {
    totalMinutes: number;
    overtimeMinutes: number;
    lateMinutes: number;
    earlyMinutes: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    holidayDays: number;
    lateDays: number;
  };
  range: { startDate: string | null; endDate: string | null };
};

type ImportError = {
  row: number;
  field?: string;
  code: string;
};

type ImportSummary = {
  created: number;
  errors: ImportError[];
};

const mapAttendanceError = (error?: string) => {
  switch (error) {
    case "Attendance already exists":
      return "attendance.errors.duplicateRecord";
    case "Invalid employee":
      return "attendance.errors.invalidEmployee";
    case "Invalid payload":
      return "attendance.errors.invalidPayload";
    case "Not found":
      return "attendance.errors.notFound";
    case "Employee profile not found":
      return "attendance.errors.noEmployee";
    default:
      return "error.saveFailed";
  }
};

const mapImportError = (error: ImportError) => {
  switch (error.code) {
    case "invalid_date":
      return "attendance.importError.invalid_date";
    case "invalid_employee":
      return "attendance.importError.invalid_employee";
    case "duplicate_record":
      return "attendance.importError.duplicate_record";
    default:
      return "error.saveFailed";
  }
};

export default function AttendancePage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const isPrivileged = ["owner", "admin", "hr"].includes(activeCompany?.role ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [selfMessageKey, setSelfMessageKey] = useState<string | null>(null);
  const [shiftStart, setShiftStart] = useState("09:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);
  const [graceMinutes, setGraceMinutes] = useState("10");
  const [roundingMinutes, setRoundingMinutes] = useState("15");
  const [overtimeThresholdMinutes, setOvertimeThresholdMinutes] = useState("0");
  const [holidays, setHolidays] = useState<AttendanceHoliday[]>([]);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayIsPaid, setHolidayIsPaid] = useState(true);
  const [editHolidayId, setEditHolidayId] = useState<string | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [recordEmployeeId, setRecordEmployeeId] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [recordCheckIn, setRecordCheckIn] = useState("");
  const [recordCheckOut, setRecordCheckOut] = useState("");
  const [recordStatus, setRecordStatus] = useState("auto");
  const [recordNotes, setRecordNotes] = useState("");
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [filterEmployeeId, setFilterEmployeeId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [isPending, startTransition] = useTransition();

  const dayOptions = useMemo(
    () => [
      { value: 0, label: t("days.sun") },
      { value: 1, label: t("days.mon") },
      { value: 2, label: t("days.tue") },
      { value: 3, label: t("days.wed") },
      { value: 4, label: t("days.thu") },
      { value: 5, label: t("days.fri") },
      { value: 6, label: t("days.sat") },
    ],
    [t]
  );

  const statusOptions = useMemo(
    () => [
      { value: "auto", label: t("attendance.status.auto") },
      { value: "present", label: t("attendance.status.present") },
      { value: "late", label: t("attendance.status.late") },
      { value: "absent", label: t("attendance.status.absent") },
      { value: "leave", label: t("attendance.status.leave") },
      { value: "holiday", label: t("attendance.status.holiday") },
    ],
    [t]
  );

  const exportUrl = useMemo(() => {
    if (!activeCompanyId) {
      return "";
    }
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (filterEmployeeId !== "all") {
      params.set("employeeId", filterEmployeeId);
    }
    if (filterStatus !== "all") {
      params.set("status", filterStatus);
    }
    if (filterStartDate) {
      params.set("startDate", filterStartDate);
    }
    if (filterEndDate) {
      params.set("endDate", filterEndDate);
    }
    return `/api/attendance/records/export?${params.toString()}`;
  }, [activeCompanyId, filterEmployeeId, filterStatus, filterStartDate, filterEndDate]);

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((employee) => map.set(employee.id, employee));
    return map;
  }, [employees]);

  const displayEmployeeName = (employee?: Employee | null) => {
    if (!employee) {
      return "-";
    }
    return locale === "ar" ? employee.nameAr : employee.nameEn;
  };

  const formatMinutes = (minutes: number) => `${minutes} ${t("attendance.minutes")}`;

  const loadSettings = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingSettings(true);
    fetch(`/api/attendance/settings?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const settingsData = data.settings as AttendanceSettings | undefined;
        if (!settingsData) {
          return;
        }
        setShiftStart(settingsData.shiftStart ?? "09:00");
        setShiftEnd(settingsData.shiftEnd ?? "17:00");
        setWeekendDays(settingsData.weekendDays ?? [5, 6]);
        setGraceMinutes(String(settingsData.graceMinutes ?? 10));
        setRoundingMinutes(String(settingsData.roundingMinutes ?? 15));
        setOvertimeThresholdMinutes(String(settingsData.overtimeThresholdMinutes ?? 0));
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingSettings(false));
  }, [activeCompanyId]);

  const loadEmployees = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingEmployees(true);
    fetch(`/api/employees?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, [activeCompanyId]);

  const loadHolidays = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingHolidays(true);
    fetch(`/api/attendance/holidays?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setHolidays(data.holidays ?? []))
      .catch(() => setHolidays([]))
      .finally(() => setLoadingHolidays(false));
  }, [activeCompanyId]);

  const loadRecords = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingRecords(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (filterEmployeeId !== "all") {
      params.set("employeeId", filterEmployeeId);
    }
    if (filterStatus !== "all") {
      params.set("status", filterStatus);
    }
    if (filterStartDate) {
      params.set("startDate", filterStartDate);
    }
    if (filterEndDate) {
      params.set("endDate", filterEndDate);
    }
    fetch(`/api/attendance/records?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setRecords(data.records ?? []))
      .catch(() => setRecords([]))
      .finally(() => setLoadingRecords(false));
  }, [activeCompanyId, filterEmployeeId, filterEndDate, filterStartDate, filterStatus]);

  const loadSummary = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingSummary(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (filterEmployeeId !== "all") {
      params.set("employeeId", filterEmployeeId);
    }
    if (filterStartDate) {
      params.set("startDate", filterStartDate);
    }
    if (filterEndDate) {
      params.set("endDate", filterEndDate);
    }
    fetch(`/api/attendance/summary?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setLoadingSummary(false));
  }, [activeCompanyId, filterEmployeeId, filterEndDate, filterStartDate]);

  useEffect(() => {
    loadSettings();
    loadEmployees();
    loadHolidays();
    loadRecords();
    loadSummary();
  }, [loadSettings, loadEmployees, loadHolidays, loadRecords, loadSummary]);

  useEffect(() => {
    loadRecords();
    loadSummary();
  }, [loadRecords, loadSummary]);

  useEffect(() => {
    if (!employees.length) {
      return;
    }
    if (!recordEmployeeId) {
      setRecordEmployeeId(employees[0].id);
    }
    if (filterEmployeeId === "all" && !isPrivileged) {
      setFilterEmployeeId(employees[0].id);
    }
  }, [employees, recordEmployeeId, filterEmployeeId, isPrivileged]);

  const toggleWeekendDay = (value: number) => {
    setWeekendDays((prev) => {
      if (prev.includes(value)) {
        return prev.filter((day) => day !== value);
      }
      return [...prev, value].sort();
    });
  };

  const resetHolidayForm = () => {
    setHolidayName("");
    setHolidayDate("");
    setHolidayIsPaid(true);
    setEditHolidayId(null);
  };

  const resetRecordForm = () => {
    setRecordDate("");
    setRecordCheckIn("");
    setRecordCheckOut("");
    setRecordStatus("auto");
    setRecordNotes("");
    setEditRecordId(null);
  };

  const handleSaveSettings = () => {
    if (!activeCompanyId) {
      return;
    }
    const grace = Number(graceMinutes);
    const rounding = Number(roundingMinutes);
    const overtime = Number(overtimeThresholdMinutes);
    if ([grace, rounding, overtime].some((value) => Number.isNaN(value))) {
      setErrorKey("attendance.errors.invalidNumber");
      return;
    }
    setErrorKey(null);
    setSuccessKey(null);
    startTransition(async () => {
      const response = await fetch("/api/attendance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          shiftStart,
          shiftEnd,
          weekendDays,
          graceMinutes: grace,
          roundingMinutes: rounding,
          overtimeThresholdMinutes: overtime,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapAttendanceError(data?.error));
        return;
      }
      setSuccessKey("attendance.settingsSaved");
      loadSettings();
    });
  };

  const handleSaveHoliday = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!holidayName.trim() || !holidayDate) {
      setErrorKey("attendance.errors.missingHoliday");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        companyId: activeCompanyId,
        name: holidayName.trim(),
        date: holidayDate,
        isPaid: holidayIsPaid,
      };
      const response = await fetch(
        editHolidayId ? `/api/attendance/holidays/${editHolidayId}` : "/api/attendance/holidays",
        {
          method: editHolidayId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapAttendanceError(data?.error));
        return;
      }
      resetHolidayForm();
      loadHolidays();
    });
  };

  const handleEditHoliday = (holiday: AttendanceHoliday) => {
    setEditHolidayId(holiday.id);
    setHolidayName(holiday.name);
    setHolidayDate(holiday.date);
    setHolidayIsPaid(Boolean(holiday.isPaid));
  };

  const handleDeleteHoliday = (holidayId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/attendance/holidays/${holidayId}?companyId=${activeCompanyId}`, {
        method: "DELETE",
      });
      loadHolidays();
    });
  };

  const handleSaveRecord = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!recordEmployeeId || !recordDate) {
      setErrorKey("attendance.errors.missingRecord");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        companyId: activeCompanyId,
        employeeId: recordEmployeeId,
        date: recordDate,
        checkIn: recordCheckIn || null,
        checkOut: recordCheckOut || null,
        status: recordStatus === "auto" ? undefined : recordStatus,
        source: "manual",
        notes: recordNotes.trim() || null,
      };
      const response = await fetch(
        editRecordId ? `/api/attendance/records/${editRecordId}` : "/api/attendance/records",
        {
          method: editRecordId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapAttendanceError(data?.error));
        return;
      }
      resetRecordForm();
      loadRecords();
      loadSummary();
    });
  };

  const handleEditRecord = (record: AttendanceRecord) => {
    setEditRecordId(record.id);
    setRecordEmployeeId(record.employeeId);
    setRecordDate(record.date);
    setRecordCheckIn(record.checkIn ?? "");
    setRecordCheckOut(record.checkOut ?? "");
    setRecordStatus(record.status ?? "auto");
    setRecordNotes(record.notes ?? "");
  };

  const handleDeleteRecord = (recordId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/attendance/records/${recordId}?companyId=${activeCompanyId}`, {
        method: "DELETE",
      });
      loadRecords();
      loadSummary();
    });
  };

  const handleDownloadTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/attendance/records/import?companyId=${activeCompanyId}&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        locale === "ar" ? "attendance-template-ar.csv" : "attendance-template-en.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleImport = () => {
    if (!activeCompanyId || !importFile) {
      return;
    }
    setErrorKey(null);
    setImportSummary(null);
    startTransition(async () => {
      const csv = await importFile.text();
      const response = await fetch("/api/attendance/records/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, csv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Missing headers") {
          setErrorKey("attendance.importError.missing_headers");
        } else if (data?.error === "Missing date column") {
          setErrorKey("attendance.importError.missing_date");
        } else {
          setErrorKey(mapAttendanceError(data?.error));
        }
        return;
      }
      setImportSummary({
        created: data.created ?? 0,
        errors: data.errors ?? [],
      });
      setImportFile(null);
      loadRecords();
      loadSummary();
    });
  };

  const handleSelfCheckIn = () => {
    if (!activeCompanyId) {
      return;
    }
    setSelfMessageKey(null);
    startTransition(async () => {
      const response = await fetch("/api/attendance/self/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapAttendanceError(data?.error));
        setSelfMessageKey("attendance.self.failed");
        return;
      }
      setSelfMessageKey("attendance.self.success");
      loadRecords();
      loadSummary();
    });
  };

  const handleSelfCheckOut = () => {
    if (!activeCompanyId) {
      return;
    }
    setSelfMessageKey(null);
    startTransition(async () => {
      const response = await fetch("/api/attendance/self/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapAttendanceError(data?.error));
        setSelfMessageKey("attendance.self.failed");
        return;
      }
      setSelfMessageKey("attendance.self.success");
      loadRecords();
      loadSummary();
    });
  };
  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("attendance.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("attendance.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {successKey ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {t(successKey)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("attendance.summaryTitle")}</h2>
            <p className="text-xs text-muted">{t("attendance.summarySubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <label className={alignClass}>
              <span className="mb-1 block">{t("attendance.filterStartDate")}</span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-1 text-xs"
                value={filterStartDate}
                onChange={(event) => setFilterStartDate(event.target.value)}
              />
            </label>
            <label className={alignClass}>
              <span className="mb-1 block">{t("attendance.filterEndDate")}</span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-1 text-xs"
                value={filterEndDate}
                onChange={(event) => setFilterEndDate(event.target.value)}
              />
            </label>
          </div>
        </div>
        {loadingSummary ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-surface px-4 py-3">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="mt-3 h-6 w-24" />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.presentDays")}</p>
              <p className="text-lg font-semibold">{summary?.totals?.presentDays ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.absentDays")}</p>
              <p className="text-lg font-semibold">{summary?.totals?.absentDays ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.leaveDays")}</p>
              <p className="text-lg font-semibold">{summary?.totals?.leaveDays ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.holidayDays")}</p>
              <p className="text-lg font-semibold">{summary?.totals?.holidayDays ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.lateDays")}</p>
              <p className="text-lg font-semibold">{summary?.totals?.lateDays ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.totalMinutes")}</p>
              <p className="text-lg font-semibold">
                {formatMinutes(summary?.totals?.totalMinutes ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.overtimeMinutes")}</p>
              <p className="text-lg font-semibold">
                {formatMinutes(summary?.totals?.overtimeMinutes ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.lateMinutes")}</p>
              <p className="text-lg font-semibold">
                {formatMinutes(summary?.totals?.lateMinutes ?? 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-xs text-muted">{t("attendance.summary.earlyMinutes")}</p>
              <p className="text-lg font-semibold">
                {formatMinutes(summary?.totals?.earlyMinutes ?? 0)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="app-card p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("attendance.self.title")}</h2>
          <p className="text-xs text-muted">{t("attendance.self.subtitle")}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSelfCheckIn}
            className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("attendance.self.checkIn")}
          </button>
          <button
            type="button"
            onClick={handleSelfCheckOut}
            className="cursor-pointer rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("attendance.self.checkOut")}
          </button>
          {selfMessageKey ? (
            <span className="text-xs text-muted">{t(selfMessageKey)}</span>
          ) : null}
        </div>
      </div>

      {isPrivileged ? (
        <div className="app-card p-6 card-modern">
          <div>
            <h2 className="text-lg font-semibold">{t("attendance.settingsTitle")}</h2>
            <p className="text-xs text-muted">{t("attendance.settingsSubtitle")}</p>
          </div>
          {loadingSettings ? (
            <div className="mt-4 space-y-3">
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-10 w-full" />
                ))}
              </div>
              <SkeletonBlock className="h-9 w-24" />
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("attendance.shiftStart")}</span>
                  <input
                    type="time"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={shiftStart}
                    onChange={(event) => setShiftStart(event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("attendance.shiftEnd")}</span>
                  <input
                    type="time"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={shiftEnd}
                    onChange={(event) => setShiftEnd(event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("attendance.graceMinutes")}</span>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={graceMinutes}
                    onChange={(event) => setGraceMinutes(event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("attendance.roundingMinutes")}</span>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={roundingMinutes}
                    onChange={(event) => setRoundingMinutes(event.target.value)}
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">
                    {t("attendance.overtimeThresholdMinutes")}
                  </span>
                  <input
                    type="number"
                    min="0"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={overtimeThresholdMinutes}
                    onChange={(event) => setOvertimeThresholdMinutes(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-4">
                <p className={`text-xs text-muted ${alignClass}`}>{t("attendance.weekendDays")}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {dayOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={weekendDays.includes(option.value)}
                        onChange={() => toggleWeekendDay(option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="mt-4 cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {t("common.save")}
              </button>
            </>
          )}
        </div>
      ) : null}

      {isPrivileged ? (
        <div className="app-card p-6 card-modern">
          <div>
            <h2 className="text-lg font-semibold">{t("attendance.holidaysTitle")}</h2>
            <p className="text-xs text-muted">{t("attendance.holidaysSubtitle")}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("attendance.holidayName")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={holidayName}
                onChange={(event) => setHolidayName(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("attendance.holidayDate")}</span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={holidayDate}
                onChange={(event) => setHolidayDate(event.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={holidayIsPaid}
                onChange={(event) => setHolidayIsPaid(event.target.checked)}
              />
              {t("attendance.holidayPaid")}
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSaveHoliday}
              className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              disabled={isPending}
            >
              {editHolidayId ? t("attendance.holidayUpdate") : t("attendance.holidayCreate")}
            </button>
            {editHolidayId ? (
              <button
                type="button"
                onClick={resetHolidayForm}
                className="cursor-pointer rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground transition hover:bg-surface-muted"
              >
                {t("attendance.holidayCancelEdit")}
              </button>
            ) : null}
          </div>
          <div className="mt-4">
            {loadingHolidays ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-40" />
                {Array.from({ length: 4 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : holidays.length === 0 ? (
              <p className="text-sm text-muted page-subtitle">{t("attendance.holidaysEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm table-modern">
                  <thead className="bg-surface-muted text-muted thead-modern">
                    <tr>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.holidayName")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.holidayDate")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.holidayPaid")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {holidays.map((holiday) => (
                      <tr key={holiday.id}>
                        <td className="px-4 py-2 font-semibold">{holiday.name}</td>
                        <td className="px-4 py-2">{holiday.date}</td>
                        <td className="px-4 py-2">
                          {holiday.isPaid ? t("common.yes") : t("common.no")}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleEditHoliday(holiday)}
                              className="cursor-pointer text-xs font-semibold text-foreground underline decoration-dotted"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHoliday(holiday.id)}
                              className="cursor-pointer text-xs font-semibold text-rose-600"
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
      {isPrivileged ? (
        <div className="app-card p-6 card-modern">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("attendance.importTitle")}</h2>
              <p className="text-xs text-muted">{t("attendance.importHint")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="cursor-pointer rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                disabled={isPending}
              >
                {t("common.downloadTemplate")}
              </button>
              <label className="text-xs text-muted">
                <input
                  type="file"
                  accept="text/csv"
                  className="block w-full text-xs"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                onClick={handleImport}
                className="cursor-pointer rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
                disabled={isPending || !importFile}
              >
                {t("common.import")}
              </button>
            </div>
          </div>
          {importSummary ? (
            <div className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
              <p>{t("attendance.importSummary", { count: String(importSummary.created) })}</p>
              {importSummary.errors.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold">{t("attendance.importErrors")}</p>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {importSummary.errors.map((error) => (
                      <li key={`${error.row}-${error.code}`}>
                        #{error.row} - {t(mapImportError(error))}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("attendance.recordsTitle")}</h2>
            <p className="text-xs text-muted">{t("attendance.recordsSubtitle")}</p>
          </div>
          <a
            href={exportUrl || "#"}
            className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
              activeCompanyId ? "" : "pointer-events-none opacity-60"
            }`}
          >
            {t("attendance.exportCsv")}
          </a>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("attendance.filterEmployee")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filterEmployeeId}
              onChange={(event) => setFilterEmployeeId(event.target.value)}
              disabled={!isPrivileged || loadingEmployees}
            >
              <option value="all">{t("common.all")}</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {displayEmployeeName(employee)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("attendance.filterStatus")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {statusOptions.filter((option) => option.value !== "auto").map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("attendance.filterStartDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filterStartDate}
              onChange={(event) => setFilterStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("attendance.filterEndDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filterEndDate}
              onChange={(event) => setFilterEndDate(event.target.value)}
            />
          </label>
        </div>

        {isPrivileged ? (
          <div className="mt-6 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-muted">{t("attendance.recordCreate")}</h3>
            <div className="mt-3 grid gap-4 md:grid-cols-4">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordEmployee")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordEmployeeId}
                  onChange={(event) => setRecordEmployeeId(event.target.value)}
                  disabled={Boolean(editRecordId) || loadingEmployees}
                >
                  <option value="">{t("common.none")}</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {displayEmployeeName(employee)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordDate}
                  onChange={(event) => setRecordDate(event.target.value)}
                  disabled={Boolean(editRecordId)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordCheckIn")}</span>
                <input
                  type="time"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordCheckIn}
                  onChange={(event) => setRecordCheckIn(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordCheckOut")}</span>
                <input
                  type="time"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordCheckOut}
                  onChange={(event) => setRecordCheckOut(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordStatus")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordStatus}
                  onChange={(event) => setRecordStatus(event.target.value)}
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm md:col-span-3 ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("attendance.recordNotes")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={recordNotes}
                  onChange={(event) => setRecordNotes(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveRecord}
                className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {editRecordId ? t("attendance.recordUpdate") : t("attendance.recordCreate")}
              </button>
              <button
                type="button"
                onClick={resetRecordForm}
                className="cursor-pointer rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground transition hover:bg-surface-muted"
              >
                {t("attendance.recordClear")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          {loadingRecords ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              {Array.from({ length: 6 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-10 w-full" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted page-subtitle">{t("attendance.recordsEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordEmployee")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordDate")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordStatus")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordCheckIn")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordCheckOut")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordTotalMinutes")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordOvertimeMinutes")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordLateMinutes")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordEarlyMinutes")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("attendance.recordSource")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map((record) => {
                    const employee = employeeById.get(record.employeeId);
                    return (
                      <tr key={record.id}>
                        <td className="px-4 py-2">
                          <p className="font-semibold">{displayEmployeeName(employee)}</p>
                          {employee?.employeeNumber ? (
                            <p className="text-xs text-muted">{employee.employeeNumber}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-2">{record.date}</td>
                        <td className="px-4 py-2">{t(`attendance.status.${record.status}`)}</td>
                        <td className="px-4 py-2">{record.checkIn ?? "-"}</td>
                        <td className="px-4 py-2">{record.checkOut ?? "-"}</td>
                        <td className="px-4 py-2">{formatMinutes(record.totalMinutes)}</td>
                        <td className="px-4 py-2">{formatMinutes(record.overtimeMinutes)}</td>
                        <td className="px-4 py-2">{formatMinutes(record.lateMinutes)}</td>
                        <td className="px-4 py-2">{formatMinutes(record.earlyMinutes)}</td>
                        <td className="px-4 py-2">{t(`attendance.source.${record.source}`)}</td>
                        <td className="px-4 py-2">
                          {isPrivileged ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => handleEditRecord(record)}
                                className="cursor-pointer text-xs font-semibold text-foreground underline decoration-dotted"
                              >
                                {t("common.edit")}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(record.id)}
                                className="cursor-pointer text-xs font-semibold text-rose-600"
                              >
                                {t("common.delete")}
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
