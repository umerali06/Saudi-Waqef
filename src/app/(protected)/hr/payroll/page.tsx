
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { HelpLink } from "@/components/help-link";
import { SkeletonBlock } from "@/components/skeleton";

type Account = {
  id: string;
  code: string;
  name: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  departmentId?: string | null;
  status?: string;
};

type Department = {
  id: string;
  nameAr: string;
  nameEn: string;
  status?: string;
};

type PayrollSettings = {
  cycle: "monthly";
  overtimeMultiplier: number;
  latenessPenaltyPerMinute: number;
  gosiEnabled: boolean;
  gosiEmployeeRate: number;
  gosiEmployerRate: number;
  incomeTaxEnabled: boolean;
  incomeTaxRate: number;
  salaryExpenseAccountId: string | null;
  payrollPayableAccountId: string | null;
  salaryDeductionsAccountId: string | null;
  paymentAccountId: string | null;
};

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "approved" | "paid";
  totals: {
    grossPay: number;
    totalDeductions: number;
    netPay: number;
    employeeCount: number;
  };
  paidAt?: string | null;
  paymentMethod?: string | null;
  paymentAccountId?: string | null;
};

type PayrollRunItem = {
  id: string;
  employeeId: string;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  overtimePay: number;
  lateMinutes: number;
  unpaidLeaveDays: number;
  absentDays: number;
  adjustmentsTotal: number;
  gosiDeduction?: number;
  incomeTaxDeduction?: number;
  currency: string;
};

type PayrollAdjustment = {
  id: string;
  runItemId: string;
  amount: number;
  reason: string;
  createdAt?: string;
};

const mapPayrollError = (error?: string) => {
  switch (error) {
    case "Payroll run exists":
      return "payroll.errors.runExists";
    case "Invalid period":
      return "payroll.errors.invalidPeriod";
    case "Missing payroll accounts":
      return "payroll.errors.missingAccounts";
    case "Missing deduction account":
      return "payroll.errors.missingDeductionAccount";
    case "Missing payment account":
      return "payroll.errors.missingPaymentAccount";
    case "Payroll run locked":
      return "payroll.errors.runLocked";
    case "Approval requires owner or admin":
      return "payroll.errors.approvalThreshold";
    case "No eligible employees":
      return "payroll.errors.noEmployees";
    default:
      return "error.saveFailed";
  }
};

export default function PayrollPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const isPrivileged = ["owner", "admin", "hr"].includes(activeCompany?.role ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [payrollCycle, setPayrollCycle] = useState<PayrollSettings["cycle"]>("monthly");
  const [overtimeMultiplier, setOvertimeMultiplier] = useState("1.5");
  const [latenessPenaltyPerMinute, setLatenessPenaltyPerMinute] = useState("0");
  const [gosiEnabled, setGosiEnabled] = useState(false);
  const [gosiEmployeeRate, setGosiEmployeeRate] = useState("0");
  const [gosiEmployerRate, setGosiEmployerRate] = useState("0");
  const [incomeTaxEnabled, setIncomeTaxEnabled] = useState(false);
  const [incomeTaxRate, setIncomeTaxRate] = useState("0");
  const [salaryExpenseAccountId, setSalaryExpenseAccountId] = useState("");
  const [payrollPayableAccountId, setPayrollPayableAccountId] = useState("");
  const [salaryDeductionsAccountId, setSalaryDeductionsAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runItems, setRunItems] = useState<PayrollRunItem[]>([]);
  const [runAdjustments, setRunAdjustments] = useState<PayrollAdjustment[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [scope, setScope] = useState("all");
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAccountOverride, setPaymentAccountOverride] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [adjustItemId, setAdjustItemId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);
  const [isPending, startTransition] = useTransition();

  const accountOptions = useMemo(
    () => accounts.filter((account) => account.isPosting && account.status === "active"),
    [accounts]
  );

  const departmentLookup = useMemo(() => {
    const map = new Map<string, Department>();
    departments.forEach((dept) => {
      map.set(dept.id, dept);
    });
    return map;
  }, [departments]);

  const displayEmployeeName = useCallback(
    (employee?: Employee | null) => {
      if (!employee) {
        return "-";
      }
      return locale === "ar" ? employee.nameAr : employee.nameEn;
    },
    [locale]
  );

  const getEmployeeById = useCallback(
    (employeeId: string) => employees.find((employee) => employee.id === employeeId),
    [employees]
  );

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
      }),
    [locale]
  );

  const formatDate = useCallback(
    (value?: string | null) => {
      if (!value) {
        return "-";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return formatter.format(date);
    },
    [formatter]
  );

  const formatMoney = (value: number, currency = "SAR") =>
    `${value.toFixed(2)} ${currency}`;

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingLookups(true);
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => setAccounts([]))
      .finally(() => setLoadingLookups(false));
  }, [activeCompanyId]);

  const loadEmployees = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingLookups(true);
    fetch(`/api/employees?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingLookups(false));
  }, [activeCompanyId]);

  const loadDepartments = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingLookups(true);
    fetch(`/api/departments?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setDepartments(data.departments ?? []))
      .catch(() => setDepartments([]))
      .finally(() => setLoadingLookups(false));
  }, [activeCompanyId]);

  const loadSettings = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingSettings(true);
    fetch(`/api/payroll/settings?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const settingsData = data.settings as PayrollSettings | undefined;
        if (!settingsData) {
          return;
        }
        setPayrollCycle(settingsData.cycle ?? "monthly");
        setOvertimeMultiplier(String(settingsData.overtimeMultiplier ?? 1.5));
        setLatenessPenaltyPerMinute(String(settingsData.latenessPenaltyPerMinute ?? 0));
        setGosiEnabled(settingsData.gosiEnabled ?? false);
        setGosiEmployeeRate(String(settingsData.gosiEmployeeRate ?? 0));
        setGosiEmployerRate(String(settingsData.gosiEmployerRate ?? 0));
        setIncomeTaxEnabled(settingsData.incomeTaxEnabled ?? false);
        setIncomeTaxRate(String(settingsData.incomeTaxRate ?? 0));
        setSalaryExpenseAccountId(settingsData.salaryExpenseAccountId ?? "");
        setPayrollPayableAccountId(settingsData.payrollPayableAccountId ?? "");
        setSalaryDeductionsAccountId(settingsData.salaryDeductionsAccountId ?? "");
        setPaymentAccountId(settingsData.paymentAccountId ?? "");
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingSettings(false));
  }, [activeCompanyId]);

  const loadRuns = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingRuns(true);
    fetch(`/api/payroll/runs?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setRuns(data.runs ?? []))
      .catch(() => setRuns([]))
      .finally(() => setLoadingRuns(false));
  }, [activeCompanyId]);

  const loadRunDetails = useCallback((runId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingRunDetails(true);
    fetch(`/api/payroll/runs/${runId}?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        setSelectedRunId(runId);
        setRunItems(data.items ?? []);
        setRunAdjustments(data.adjustments ?? []);
        const run = runs.find((entry) => entry.id === runId);
        setPaymentMethod(run?.paymentMethod ?? "");
        setPaymentAccountOverride(run?.paymentAccountId ?? "");
        setPaymentDate(run?.paidAt ? run.paidAt.slice(0, 10) : "");
      })
      .catch(() => {
        setRunItems([]);
        setRunAdjustments([]);
      })
      .finally(() => setLoadingRunDetails(false));
  }, [activeCompanyId, runs]);
  useEffect(() => {
    loadAccounts();
    loadEmployees();
    loadDepartments();
    loadSettings();
    loadRuns();
  }, [loadAccounts, loadEmployees, loadDepartments, loadSettings, loadRuns]);

  useEffect(() => {
    if (selectedRunId) {
      loadRunDetails(selectedRunId);
    }
  }, [selectedRunId, loadRunDetails]);

  const toggleEmployee = (employeeId: string) => {
    setSelectedEmployeeIds((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : [...prev, employeeId]
    );
  };

  const handleSaveSettings = () => {
    if (!activeCompanyId) {
      return;
    }
    const overtime = Number(overtimeMultiplier);
    const lateness = Number(latenessPenaltyPerMinute);
    const gosiEmployee = Number(gosiEmployeeRate);
    const gosiEmployer = Number(gosiEmployerRate);
    const incomeTax = Number(incomeTaxRate);
    if (
      Number.isNaN(overtime) ||
      Number.isNaN(lateness) ||
      Number.isNaN(gosiEmployee) ||
      Number.isNaN(gosiEmployer) ||
      Number.isNaN(incomeTax)
    ) {
      setErrorKey("payroll.errors.invalidSettings");
      return;
    }
    setErrorKey(null);
    setSuccessKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payroll/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          cycle: payrollCycle,
          overtimeMultiplier: overtime,
          latenessPenaltyPerMinute: lateness,
          gosiEnabled,
          gosiEmployeeRate: gosiEmployee,
          gosiEmployerRate: gosiEmployer,
          incomeTaxEnabled,
          incomeTaxRate: incomeTax,
          salaryExpenseAccountId: salaryExpenseAccountId || null,
          payrollPayableAccountId: payrollPayableAccountId || null,
          salaryDeductionsAccountId: salaryDeductionsAccountId || null,
          paymentAccountId: paymentAccountId || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPayrollError(data?.error));
        return;
      }
      setSuccessKey("payroll.settingsSaved");
      loadSettings();
    });
  };

  const handleCreateRun = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!periodStart || !periodEnd) {
      setErrorKey("payroll.errors.invalidPeriod");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          periodStart,
          periodEnd,
          employeeIds: scope === "selected" ? selectedEmployeeIds : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPayrollError(data?.error));
        return;
      }
      setPeriodStart("");
      setPeriodEnd("");
      setSelectedEmployeeIds([]);
      loadRuns();
    });
  };

  const handleApproveRun = (runId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/payroll/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPayrollError(data?.error));
        return;
      }
      loadRuns();
      loadRunDetails(runId);
    });
  };

  const handlePayRun = (runId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/payroll/runs/${runId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          paymentMethod: paymentMethod || null,
          paymentAccountId: paymentAccountOverride || null,
          paymentDate: paymentDate || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPayrollError(data?.error));
        return;
      }
      setPaymentMethod("");
      setPaymentAccountOverride("");
      setPaymentDate("");
      loadRuns();
      loadRunDetails(runId);
    });
  };

  const handleExportRun = (runId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/payroll/runs/${runId}/export?companyId=${activeCompanyId}&format=csv`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payroll-run.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleExportPayslips = (runId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/payroll/runs/${runId}/export?companyId=${activeCompanyId}&format=pdf&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payroll-payslips.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleExportPayslip = (itemId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/payroll/payslips/${itemId}/export?companyId=${activeCompanyId}&format=pdf&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "payslip.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleCreateAdjustment = () => {
    if (!activeCompanyId || !selectedRunId) {
      return;
    }
    if (!adjustItemId || !adjustReason.trim()) {
      setErrorKey("payroll.errors.missingAdjustment");
      return;
    }
    const amount = Number(adjustAmount);
    if (Number.isNaN(amount)) {
      setErrorKey("payroll.errors.invalidAdjustment");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/payroll/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          runId: selectedRunId,
          runItemId: adjustItemId,
          amount,
          reason: adjustReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapPayrollError(data?.error));
        return;
      }
      setAdjustAmount("0");
      setAdjustReason("");
      loadRunDetails(selectedRunId);
    });
  };

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const previousRun = useMemo(() => {
    if (!selectedRun) {
      return null;
    }
    const currentIndex = runs.findIndex((run) => run.id === selectedRun.id);
    if (currentIndex === -1) {
      return null;
    }
    return runs.slice(currentIndex + 1).find(Boolean) ?? null;
  }, [runs, selectedRun]);

  const variance = selectedRun && previousRun
    ? {
        gross: selectedRun.totals.grossPay - previousRun.totals.grossPay,
        deductions: selectedRun.totals.totalDeductions - previousRun.totals.totalDeductions,
        net: selectedRun.totals.netPay - previousRun.totals.netPay,
        period: `${formatDate(previousRun.periodStart)} - ${formatDate(previousRun.periodEnd)}`,
      }
    : null;

  const departmentSummary = useMemo(() => {
    const summary = new Map<
      string,
      { id: string; name: string; gross: number; deductions: number; net: number; count: number }
    >();
    runItems.forEach((item) => {
      const employee = getEmployeeById(item.employeeId);
      const departmentId = employee?.departmentId ?? "unassigned";
      const dept = departmentLookup.get(departmentId);
      const name =
        dept ?
          locale === "ar"
            ? dept.nameAr
            : dept.nameEn
        : t("payroll.departmentUnassigned");
      const entry =
        summary.get(departmentId) ?? {
          id: departmentId,
          name,
          gross: 0,
          deductions: 0,
          net: 0,
          count: 0,
        };
      entry.gross += item.grossPay;
      entry.deductions += item.totalDeductions;
      entry.net += item.netPay;
      entry.count += 1;
      summary.set(departmentId, entry);
    });
    return Array.from(summary.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [runItems, departmentLookup, getEmployeeById, locale, t]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("payroll.title")}</h1>
          <p className="text-sm text-muted">{t("payroll.subtitle")}</p>
        </div>
        <HelpLink query="payroll" />
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {successKey ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {t(successKey)}
        </div>
      ) : null}

      {isPrivileged ? (
        <div className="app-card p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("payroll.settingsTitle")}</h2>
            <p className="text-xs text-muted">{t("payroll.settingsSubtitle")}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.cycle")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={payrollCycle}
                onChange={(event) => setPayrollCycle(event.target.value as PayrollSettings["cycle"])}
              >
                <option value="monthly">{t("payroll.cycleMonthly")}</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.overtimeMultiplier")}</span>
              <input
                type="number"
                min="1"
                step="0.1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={overtimeMultiplier}
                onChange={(event) => setOvertimeMultiplier(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("payroll.latenessPenaltyPerMinute")}
              </span>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={latenessPenaltyPerMinute}
                onChange={(event) => setLatenessPenaltyPerMinute(event.target.value)}
              />
            </label>
            <label className={`flex items-center gap-2 text-sm ${alignClass}`}>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={gosiEnabled}
                onChange={(event) => setGosiEnabled(event.target.checked)}
              />
              <span>{t("payroll.gosiEnabled")}</span>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.gosiEmployeeRate")}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={gosiEmployeeRate}
                onChange={(event) => setGosiEmployeeRate(event.target.value)}
                disabled={!gosiEnabled}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.gosiEmployerRate")}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={gosiEmployerRate}
                onChange={(event) => setGosiEmployerRate(event.target.value)}
                disabled={!gosiEnabled}
              />
            </label>
            <label className={`flex items-center gap-2 text-sm ${alignClass}`}>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={incomeTaxEnabled}
                onChange={(event) => setIncomeTaxEnabled(event.target.checked)}
              />
              <span>{t("payroll.incomeTaxEnabled")}</span>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.incomeTaxRate")}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={incomeTaxRate}
                onChange={(event) => setIncomeTaxRate(event.target.value)}
                disabled={!incomeTaxEnabled}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.salaryExpenseAccount")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryExpenseAccountId}
                  onChange={(event) => setSalaryExpenseAccountId(event.target.value)}
                  disabled={loadingLookups}
                >
                <option value="">{t("common.none")}</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.payrollPayableAccount")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={payrollPayableAccountId}
                  onChange={(event) => setPayrollPayableAccountId(event.target.value)}
                  disabled={loadingLookups}
                >
                <option value="">{t("common.none")}</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.salaryDeductionsAccount")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryDeductionsAccountId}
                  onChange={(event) => setSalaryDeductionsAccountId(event.target.value)}
                  disabled={loadingLookups}
                >
                <option value="">{t("common.none")}</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.paymentAccount")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentAccountId}
                  onChange={(event) => setPaymentAccountId(event.target.value)}
                  disabled={loadingLookups}
                >
                <option value="">{t("common.none")}</option>
                {accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={handleSaveSettings}
            className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending || loadingSettings}
          >
            {t("common.save")}
          </button>
        </div>
      ) : null}

      {isPrivileged ? (
        <div className="app-card p-5">
          <div>
            <h2 className="text-lg font-semibold">{t("payroll.runTitle")}</h2>
            <p className="text-xs text-muted">{t("payroll.runSubtitle")}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.runPeriodStart")}</span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={periodStart}
                onChange={(event) => setPeriodStart(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.runPeriodEnd")}</span>
              <input
                type="date"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={periodEnd}
                onChange={(event) => setPeriodEnd(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("payroll.runScope")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="all">{t("payroll.runScopeAll")}</option>
                <option value="selected">{t("payroll.runScopeSelected")}</option>
              </select>
            </label>
          </div>
          {scope === "selected" ? (
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {employees.map((employee) => (
                <label key={employee.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.includes(employee.id)}
                    onChange={() => toggleEmployee(employee.id)}
                  />
                  {displayEmployeeName(employee)}
                </label>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleCreateRun}
            className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("payroll.runCreate")}
          </button>
        </div>
      ) : null}

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("payroll.runListTitle")}</span>
          <span className="text-xs text-muted">{runs.length}</span>
        </div>
        {loadingRuns ? (
          <div className="space-y-2 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("payroll.runEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.runPeriod")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.runStatus")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.runNet")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.runEmployees")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-2">
                      {formatDate(run.periodStart)} - {formatDate(run.periodEnd)}
                    </td>
                    <td className="px-4 py-2">{t(`payroll.status.${run.status}`)}</td>
                    <td className="px-4 py-2">{formatMoney(run.totals.netPay)}</td>
                    <td className="px-4 py-2">{run.totals.employeeCount}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => loadRunDetails(run.id)}
                          className="cursor-pointer text-xs font-semibold text-foreground underline decoration-dotted"
                        >
                          {t("payroll.runView")}
                        </button>
                        {isPrivileged && run.status === "draft" ? (
                          <button
                            type="button"
                            onClick={() => handleApproveRun(run.id)}
                            className="cursor-pointer text-xs font-semibold text-emerald-600"
                          >
                            {t("payroll.runApprove")}
                          </button>
                        ) : null}
                        {isPrivileged && run.status === "approved" ? (
                          <button
                            type="button"
                            onClick={() => handlePayRun(run.id)}
                            className="cursor-pointer text-xs font-semibold text-foreground"
                          >
                            {t("payroll.runPay")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleExportRun(run.id)}
                          className="cursor-pointer text-xs font-semibold text-foreground"
                        >
                          {t("payroll.exportRun")}
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

      {selectedRun ? (
        <div className="app-card p-5">
          {loadingRunDetails ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-5 w-40" />
              <SkeletonBlock className="h-4 w-64" />
              <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-surface px-4 py-3">
                    <SkeletonBlock className="h-3 w-24" />
                    <SkeletonBlock className="mt-3 h-6 w-24" />
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{t("payroll.runDetailsTitle")}</h2>
                  <p className="text-xs text-muted">
                    {formatDate(selectedRun.periodStart)} - {formatDate(selectedRun.periodEnd)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    {t("payroll.runStatus")}: {t(`payroll.status.${selectedRun.status}`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleExportRun(selectedRun.id)}
                    className="cursor-pointer text-xs font-semibold text-foreground"
                  >
                    {t("payroll.exportRun")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportPayslips(selectedRun.id)}
                    className="cursor-pointer text-xs font-semibold text-foreground"
                  >
                    {t("payroll.exportPayslips")}
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs text-muted">{t("payroll.runGross")}</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(selectedRun.totals.grossPay)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs text-muted">{t("payroll.runDeductions")}</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(selectedRun.totals.totalDeductions)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-surface px-4 py-3">
                  <p className="text-xs text-muted">{t("payroll.runNet")}</p>
                  <p className="text-lg font-semibold">
                    {formatMoney(selectedRun.totals.netPay)}
                  </p>
                </div>
              </div>

          <div className="mt-6 rounded-xl border border-border bg-surface px-4 py-3">
            <h3 className="text-sm font-semibold text-muted">{t("payroll.varianceTitle")}</h3>
            {variance ? (
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted">
                    {t("payroll.varianceGross")} ({variance.period})
                  </p>
                  <p className="text-sm font-semibold">
                    {formatMoney(variance.gross)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">
                    {t("payroll.varianceDeductions")} ({variance.period})
                  </p>
                  <p className="text-sm font-semibold">
                    {formatMoney(variance.deductions)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">
                    {t("payroll.varianceNet")} ({variance.period})
                  </p>
                  <p className="text-sm font-semibold">
                    {formatMoney(variance.net)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">{t("payroll.varianceNone")}</p>
            )}
          </div>

          {selectedRun.status === "approved" && isPrivileged ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("payroll.paymentMethod")}</span>
                <input
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("payroll.paymentDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("payroll.paymentAccount")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={paymentAccountOverride}
                  onChange={(event) => setPaymentAccountOverride(event.target.value)}
                >
                  <option value="">{t("common.none")}</option>
                  {accountOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => handlePayRun(selectedRun.id)}
                  className="mt-1 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                  disabled={isPending}
                >
                  {t("payroll.runPay")}
                </button>
              </div>
            </div>
          ) : null}

          {selectedRun.status === "draft" && isPrivileged ? (
            <div className="mt-6 border-t border-border pt-6">
              <h3 className="text-sm font-semibold text-muted">{t("payroll.adjustmentsTitle")}</h3>
              <p className="text-xs text-muted">{t("payroll.adjustmentsSubtitle")}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("payroll.adjustmentEmployee")}</span>
                  <select
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={adjustItemId}
                    onChange={(event) => setAdjustItemId(event.target.value)}
                  >
                    <option value="">{t("common.none")}</option>
                    {runItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {displayEmployeeName(getEmployeeById(item.employeeId))}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("payroll.adjustmentAmount")}</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={adjustAmount}
                    onChange={(event) => setAdjustAmount(event.target.value)}
                  />
                </label>
                <label className={`text-sm md:col-span-3 ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">{t("payroll.adjustmentReason")}</span>
                  <input
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                    value={adjustReason}
                    onChange={(event) => setAdjustReason(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={handleCreateAdjustment}
                className="mt-3 cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {t("payroll.adjustmentAdd")}
              </button>
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-muted">{t("payroll.adjustmentsListTitle")}</h3>
            {runAdjustments.length === 0 ? (
              <p className="mt-2 text-xs text-muted">{t("payroll.adjustmentsEmpty")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.adjustmentEmployee")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.adjustmentAmount")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.adjustmentReason")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.adjustmentDate")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {runAdjustments.map((adjustment) => {
                      const item = runItems.find((entry) => entry.id === adjustment.runItemId);
                      return (
                        <tr key={adjustment.id}>
                          <td className="px-4 py-2">
                            {displayEmployeeName(
                              item ? getEmployeeById(item.employeeId) : undefined
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {formatMoney(adjustment.amount, item?.currency ?? "SAR")}
                          </td>
                          <td className="px-4 py-2">{adjustment.reason}</td>
                          <td className="px-4 py-2">
                            {formatDate(adjustment.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-muted">{t("payroll.departmentSummaryTitle")}</h3>
            <p className="text-xs text-muted">{t("payroll.departmentSummarySubtitle")}</p>
            {departmentSummary.length === 0 ? (
              <p className="mt-2 text-xs text-muted">{t("payroll.departmentSummaryEmpty")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.departmentName")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.departmentEmployees")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.departmentGross")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.departmentDeductions")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.departmentNet")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {departmentSummary.map((entry) => (
                      <tr key={entry.id}>
                        <td className="px-4 py-2">{entry.name}</td>
                        <td className="px-4 py-2">{entry.count}</td>
                        <td className="px-4 py-2">{formatMoney(entry.gross)}</td>
                        <td className="px-4 py-2">{formatMoney(entry.deductions)}</td>
                        <td className="px-4 py-2">{formatMoney(entry.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-muted">{t("payroll.itemsTitle")}</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-surface-muted text-muted">
                      <tr>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemEmployee")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemGross")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemDeductions")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemNet")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemOvertime")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemLate")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemUnpaidLeave")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemAbsence")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("payroll.itemAdjustments")}</th>
                        <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {runItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2">
                            {displayEmployeeName(getEmployeeById(item.employeeId))}
                          </td>
                          <td className="px-4 py-2">{formatMoney(item.grossPay, item.currency)}</td>
                          <td className="px-4 py-2">{formatMoney(item.totalDeductions, item.currency)}</td>
                          <td className="px-4 py-2">{formatMoney(item.netPay, item.currency)}</td>
                          <td className="px-4 py-2">{formatMoney(item.overtimePay, item.currency)}</td>
                          <td className="px-4 py-2">{item.lateMinutes}</td>
                          <td className="px-4 py-2">{item.unpaidLeaveDays}</td>
                          <td className="px-4 py-2">{item.absentDays}</td>
                          <td className="px-4 py-2">{formatMoney(item.adjustmentsTotal, item.currency)}</td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => handleExportPayslip(item.id)}
                              className="cursor-pointer text-xs font-semibold text-foreground underline decoration-dotted"
                            >
                              {t("payroll.payslipExport")}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
