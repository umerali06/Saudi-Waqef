
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  status?: string;
};

type LeaveType = {
  id: string;
  name: string;
  code: string;
  isPaid: boolean;
  defaultAllowance: number;
  requiresApproval: boolean;
  status: "active" | "inactive";
};

type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

type LeaveBalance = {
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  allowance: number;
  adjustments: number;
  used: number;
  balance: number;
};

type LeaveAdjustment = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  amount: number;
  reason: string;
};

const mapLeaveError = (error?: string) => {
  switch (error) {
    case "Invalid payload":
      return "leave.errors.invalidPayload";
    case "Duplicate leave type":
      return "leave.errors.duplicateType";
    case "Invalid date range":
      return "leave.errors.invalidDateRange";
    case "Invalid leave type":
      return "leave.errors.invalidLeaveType";
    case "Invalid employee":
      return "leave.errors.invalidEmployee";
    case "Invalid leave duration":
      return "leave.errors.invalidDuration";
    case "Insufficient leave balance":
      return "leave.errors.insufficientBalance";
    case "Request already processed":
      return "leave.errors.requestProcessed";
    case "Not found":
      return "leave.errors.notFound";
    case "Forbidden":
      return "leave.errors.notAllowed";
    default:
      return "error.saveFailed";
  }
};

export default function LeavePage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const isPrivileged = ["owner", "admin", "hr"].includes(activeCompany?.role ?? "");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [typeName, setTypeName] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const [typeIsPaid, setTypeIsPaid] = useState(true);
  const [typeAllowance, setTypeAllowance] = useState("0");
  const [typeRequiresApproval, setTypeRequiresApproval] = useState(true);
  const [typeStatus, setTypeStatus] = useState<"active" | "inactive">("active");
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [requestEmployeeId, setRequestEmployeeId] = useState("");
  const [requestTypeId, setRequestTypeId] = useState("");
  const [requestStartDate, setRequestStartDate] = useState("");
  const [requestEndDate, setRequestEndDate] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("all");
  const [balanceYear, setBalanceYear] = useState(String(new Date().getFullYear()));
  const [adjustEmployeeId, setAdjustEmployeeId] = useState("");
  const [adjustLeaveTypeId, setAdjustLeaveTypeId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [loadingAdjustments, setLoadingAdjustments] = useState(true);
  const [isPending, startTransition] = useTransition();

  const requestStatusOptions = useMemo(
    () => [
      { value: "pending", label: t("leave.status.pending") },
      { value: "approved", label: t("leave.status.approved") },
      { value: "rejected", label: t("leave.status.rejected") },
      { value: "cancelled", label: t("leave.status.cancelled") },
    ],
    [t]
  );

  const requestExportUrl = useMemo(() => {
    if (!activeCompanyId) {
      return "";
    }
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (requestStatusFilter !== "all") {
      params.set("status", requestStatusFilter);
    }
    return `/api/leaves/requests/export?${params.toString()}`;
  }, [activeCompanyId, requestStatusFilter]);

  const balanceExportUrl = useMemo(() => {
    if (!activeCompanyId) {
      return "";
    }
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      year: balanceYear,
    });
    return `/api/leaves/balances/export?${params.toString()}`;
  }, [activeCompanyId, balanceYear]);

  const displayEmployeeName = (employee?: Employee | null) => {
    if (!employee) {
      return "-";
    }
    return locale === "ar" ? employee.nameAr : employee.nameEn;
  };

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

  const getTypeLabel = (typeId: string) => {
    const type = types.find((entry) => entry.id === typeId);
    return type ? type.name : "-";
  };

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

  const loadTypes = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingTypes(true);
    fetch(`/api/leaves/types?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setTypes(data.types ?? []))
      .catch(() => setTypes([]))
      .finally(() => setLoadingTypes(false));
  }, [activeCompanyId]);

  const loadRequests = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingRequests(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (requestStatusFilter !== "all") {
      params.set("status", requestStatusFilter);
    }
    fetch(`/api/leaves/requests?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setRequests(data.requests ?? []))
      .catch(() => setRequests([]))
      .finally(() => setLoadingRequests(false));
  }, [activeCompanyId, requestStatusFilter]);

  const loadBalances = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingBalances(true);
    const params = new URLSearchParams({
      companyId: activeCompanyId,
      year: balanceYear,
    });
    fetch(`/api/leaves/balances?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setBalances(data.balances ?? []))
      .catch(() => setBalances([]))
      .finally(() => setLoadingBalances(false));
  }, [activeCompanyId, balanceYear]);

  const loadAdjustments = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingAdjustments(true);
    fetch(`/api/leaves/adjustments?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setAdjustments(data.adjustments ?? []))
      .catch(() => setAdjustments([]))
      .finally(() => setLoadingAdjustments(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadEmployees();
    loadTypes();
    loadRequests();
    loadBalances();
    loadAdjustments();
  }, [loadEmployees, loadTypes, loadRequests, loadBalances, loadAdjustments]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    if (!employees.length) {
      return;
    }
    if (!requestEmployeeId) {
      setRequestEmployeeId(employees[0].id);
    }
    if (!adjustEmployeeId) {
      setAdjustEmployeeId(employees[0].id);
    }
  }, [employees, requestEmployeeId, adjustEmployeeId]);

  useEffect(() => {
    if (!types.length) {
      return;
    }
    if (!requestTypeId) {
      setRequestTypeId(types[0].id);
    }
    if (!adjustLeaveTypeId) {
      setAdjustLeaveTypeId(types[0].id);
    }
  }, [types, requestTypeId, adjustLeaveTypeId]);

  const resetTypeForm = () => {
    setTypeName("");
    setTypeCode("");
    setTypeIsPaid(true);
    setTypeAllowance("0");
    setTypeRequiresApproval(true);
    setTypeStatus("active");
    setEditTypeId(null);
  };

  const resetRequestForm = () => {
    setRequestStartDate("");
    setRequestEndDate("");
    setRequestReason("");
  };

  const resetAdjustmentForm = () => {
    setAdjustAmount("0");
    setAdjustReason("");
  };

  const handleSaveType = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!typeName.trim() || !typeCode.trim()) {
      setErrorKey("leave.errors.missingFields");
      return;
    }
    const allowance = Number(typeAllowance);
    if (Number.isNaN(allowance)) {
      setErrorKey("leave.errors.invalidPayload");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        companyId: activeCompanyId,
        name: typeName.trim(),
        code: typeCode.trim(),
        isPaid: typeIsPaid,
        defaultAllowance: allowance,
        requiresApproval: typeRequiresApproval,
        status: typeStatus,
      };
      const response = await fetch(
        editTypeId ? `/api/leaves/types/${editTypeId}` : "/api/leaves/types",
        {
          method: editTypeId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapLeaveError(data?.error));
        return;
      }
      resetTypeForm();
      loadTypes();
    });
  };

  const handleEditType = (type: LeaveType) => {
    setEditTypeId(type.id);
    setTypeName(type.name);
    setTypeCode(type.code);
    setTypeIsPaid(type.isPaid);
    setTypeAllowance(String(type.defaultAllowance));
    setTypeRequiresApproval(type.requiresApproval);
    setTypeStatus(type.status);
  };

  const handleDeleteType = (typeId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/leaves/types/${typeId}?companyId=${activeCompanyId}`, {
        method: "DELETE",
      });
      loadTypes();
    });
  };

  const handleCreateRequest = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!requestEmployeeId || !requestTypeId || !requestStartDate || !requestEndDate) {
      setErrorKey("leave.errors.missingFields");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/leaves/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          employeeId: requestEmployeeId,
          leaveTypeId: requestTypeId,
          startDate: requestStartDate,
          endDate: requestEndDate,
          reason: requestReason.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapLeaveError(data?.error));
        return;
      }
      resetRequestForm();
      loadRequests();
      loadBalances();
    });
  };

  const handleRequestAction = (requestId: string, status: "approved" | "rejected" | "cancelled") => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/leaves/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapLeaveError(data?.error));
        return;
      }
      loadRequests();
      loadBalances();
    });
  };

  const handleCreateAdjustment = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!adjustEmployeeId || !adjustLeaveTypeId || !adjustReason.trim()) {
      setErrorKey("leave.errors.missingFields");
      return;
    }
    const amount = Number(adjustAmount);
    if (Number.isNaN(amount)) {
      setErrorKey("leave.errors.invalidPayload");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/leaves/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          employeeId: adjustEmployeeId,
          leaveTypeId: adjustLeaveTypeId,
          amount,
          reason: adjustReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey(mapLeaveError(data?.error));
        return;
      }
      resetAdjustmentForm();
      loadBalances();
      loadAdjustments();
    });
  };
  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("leave.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("leave.subtitle")}</p>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("leave.typesTitle")}</h2>
            <p className="text-xs text-muted">{t("leave.typesSubtitle")}</p>
          </div>
          {isPrivileged ? (
            <button
              type="button"
              onClick={handleSaveType}
              className="cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              disabled={isPending}
            >
              {editTypeId ? t("leave.typeUpdate") : t("leave.typeCreate")}
            </button>
          ) : null}
        </div>

        {isPrivileged ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.typeName")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={typeName}
                onChange={(event) => setTypeName(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.typeCode")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={typeCode}
                onChange={(event) => setTypeCode(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.typeAllowance")}</span>
              <input
                type="number"
                min="0"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={typeAllowance}
                onChange={(event) => setTypeAllowance(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.typeStatus")}</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={typeStatus}
                onChange={(event) => setTypeStatus(event.target.value as "active" | "inactive")}
              >
                <option value="active">{t("status.active")}</option>
                <option value="inactive">{t("status.inactive")}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={typeIsPaid}
                onChange={(event) => setTypeIsPaid(event.target.checked)}
              />
              {t("leave.typePaid")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={typeRequiresApproval}
                onChange={(event) => setTypeRequiresApproval(event.target.checked)}
              />
              {t("leave.typeRequiresApproval")}
            </label>
          </div>
        ) : null}

        <div className="mt-4">
          {loadingTypes ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-10 w-full" />
              ))}
            </div>
          ) : types.length === 0 ? (
            <p className="text-sm text-muted page-subtitle">{t("leave.typesEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.typeName")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.typeCode")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.typePaid")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.typeAllowance")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.typeStatus")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {types.map((type) => (
                    <tr key={type.id}>
                      <td className="px-4 py-2 font-semibold">{type.name}</td>
                      <td className="px-4 py-2">{type.code}</td>
                      <td className="px-4 py-2">{type.isPaid ? t("common.yes") : t("common.no")}</td>
                      <td className="px-4 py-2">{type.defaultAllowance}</td>
                      <td className="px-4 py-2">{t(`status.${type.status}`)}</td>
                      <td className="px-4 py-2">
                        {isPrivileged ? (
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleEditType(type)}
                              className="cursor-pointer text-xs font-semibold text-foreground underline decoration-dotted"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteType(type.id)}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("leave.requestsTitle")}</h2>
            <p className="text-xs text-muted">{t("leave.requestsSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={requestExportUrl || "#"}
              className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("leave.exportRequestsCsv")}
            </a>
            <label className={`text-xs ${alignClass}`}>
              <span className="mb-1 block text-muted">{t("leave.requestStatus")}</span>
              <select
                className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
                value={requestStatusFilter}
                onChange={(event) => setRequestStatusFilter(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                {requestStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("leave.requestEmployee")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={requestEmployeeId}
              onChange={(event) => setRequestEmployeeId(event.target.value)}
              disabled={!isPrivileged || loadingEmployees}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {displayEmployeeName(employee)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("leave.requestType")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={requestTypeId}
              onChange={(event) => setRequestTypeId(event.target.value)}
              disabled={loadingTypes}
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("leave.requestStartDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={requestStartDate}
              onChange={(event) => setRequestStartDate(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("leave.requestEndDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={requestEndDate}
              onChange={(event) => setRequestEndDate(event.target.value)}
            />
          </label>
          <label className={`text-sm md:col-span-4 ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("leave.requestReason")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={requestReason}
              onChange={(event) => setRequestReason(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleCreateRequest}
          className="mt-4 cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("leave.requestCreate")}
        </button>

        <div className="mt-6">
          {loadingRequests ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-4 w-40" />
              {Array.from({ length: 5 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-10 w-full" />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted page-subtitle">{t("leave.requestsEmpty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-modern">
                <thead className="bg-surface-muted text-muted thead-modern">
                  <tr>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestEmployee")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestType")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestStartDate")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestEndDate")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestDays")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestStatus")}</th>
                    <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((request) => {
                    const employee = employees.find((entry) => entry.id === request.employeeId);
                    return (
                      <tr key={request.id}>
                        <td className="px-4 py-2">{displayEmployeeName(employee)}</td>
                        <td className="px-4 py-2">{getTypeLabel(request.leaveTypeId)}</td>
                        <td className="px-4 py-2">{formatDate(request.startDate)}</td>
                        <td className="px-4 py-2">{formatDate(request.endDate)}</td>
                        <td className="px-4 py-2">{request.days}</td>
                        <td className="px-4 py-2">{t(`leave.status.${request.status}`)}</td>
                        <td className="px-4 py-2">
                          {request.status === "pending" ? (
                            <div className="flex flex-wrap items-center gap-3">
                              {isPrivileged ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestAction(request.id, "approved")}
                                    className="cursor-pointer text-xs font-semibold text-emerald-600"
                                  >
                                    {t("leave.requestApprove")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestAction(request.id, "rejected")}
                                    className="cursor-pointer text-xs font-semibold text-rose-600"
                                  >
                                    {t("leave.requestReject")}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRequestAction(request.id, "cancelled")}
                                  className="cursor-pointer text-xs font-semibold text-rose-600"
                                >
                                  {t("leave.requestCancel")}
                                </button>
                              )}
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

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("leave.balancesTitle")}</h2>
            <p className="text-xs text-muted">{t("leave.balancesSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={balanceExportUrl || "#"}
              className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("leave.exportBalancesCsv")}
            </a>
            <label className={`text-xs ${alignClass}`}>
              <span className="mb-1 block text-muted">{t("leave.balanceYear")}</span>
              <input
                type="number"
                className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
                value={balanceYear}
                onChange={(event) => setBalanceYear(event.target.value)}
              />
            </label>
          </div>
        </div>

        {loadingBalances ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestEmployee")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestType")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.balanceAllowance")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.balanceAdjustments")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.balanceUsed")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("leave.balanceRemaining")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {balances.map((balance) => (
                  <tr key={`${balance.employeeId}-${balance.leaveTypeId}`}>
                    <td className="px-4 py-2">{balance.employeeName}</td>
                    <td className="px-4 py-2">{balance.leaveTypeName}</td>
                    <td className="px-4 py-2">{balance.allowance}</td>
                    <td className="px-4 py-2">{balance.adjustments}</td>
                    <td className="px-4 py-2">{balance.used}</td>
                    <td className="px-4 py-2">{balance.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isPrivileged ? (
        <div className="app-card p-6 card-modern">
          <div>
            <h2 className="text-lg font-semibold">{t("leave.adjustmentsTitle")}</h2>
            <p className="text-xs text-muted">{t("leave.adjustmentsSubtitle")}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.requestEmployee")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustEmployeeId}
              onChange={(event) => setAdjustEmployeeId(event.target.value)}
              disabled={loadingEmployees}
            >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {displayEmployeeName(employee)}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.requestType")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={adjustLeaveTypeId}
              onChange={(event) => setAdjustLeaveTypeId(event.target.value)}
              disabled={loadingTypes}
            >
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.adjustmentAmount")}</span>
              <input
                type="number"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={adjustAmount}
                onChange={(event) => setAdjustAmount(event.target.value)}
              />
            </label>
            <label className={`text-sm md:col-span-4 ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("leave.adjustmentReason")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={adjustReason}
                onChange={(event) => setAdjustReason(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleCreateAdjustment}
            className="mt-4 cursor-pointer rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("leave.adjustmentCreate")}
          </button>

          <div className="mt-4">
            {loadingAdjustments ? (
              <div className="space-y-2">
                <SkeletonBlock className="h-4 w-40" />
                {Array.from({ length: 4 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : adjustments.length === 0 ? (
              <p className="text-sm text-muted page-subtitle">{t("leave.adjustmentsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm table-modern">
                  <thead className="bg-surface-muted text-muted thead-modern">
                    <tr>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestEmployee")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("leave.requestType")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("leave.adjustmentAmount")}</th>
                      <th className={`px-4 py-2 ${alignClass}`}>{t("leave.adjustmentReason")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {adjustments.map((adjustment) => (
                      <tr key={adjustment.id}>
                        <td className="px-4 py-2">
                          {displayEmployeeName(
                            employees.find((employee) => employee.id === adjustment.employeeId)
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {getTypeLabel(adjustment.leaveTypeId)}
                        </td>
                        <td className="px-4 py-2">{adjustment.amount}</td>
                        <td className="px-4 py-2">{adjustment.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
