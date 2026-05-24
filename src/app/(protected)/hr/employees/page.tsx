"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Department = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "inactive";
};

type Position = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "inactive";
};

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  employeeNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  status: "active" | "suspended" | "terminated";
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const mapEmployeeError = (error?: string) => {
  switch (error) {
    case "Invalid department":
      return "hr.employees.invalidDepartment";
    case "Invalid position":
      return "hr.employees.invalidPosition";
    case "Invalid manager":
      return "hr.employees.invalidManager";
    case "Invalid user":
      return "hr.employees.invalidUser";
    case "Duplicate employee":
      return "hr.employees.duplicate";
    case "Invalid payload":
      return "hr.employees.invalidPayload";
    default:
      return "error.saveFailed";
  }
};

export default function EmployeesPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [iqamaNumber, setIqamaNumber] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [nationality, setNationality] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [userId, setUserId] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [status, setStatus] = useState<"active" | "suspended" | "terminated">(
    "active"
  );
  const [terminationDate, setTerminationDate] = useState("");
  const [terminationCategory, setTerminationCategory] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("hr.employees.status.active") },
      { value: "suspended", label: t("hr.employees.status.suspended") },
      { value: "terminated", label: t("hr.employees.status.terminated") },
    ],
    [t]
  );

  const exportUrl = useMemo(() => {
    if (!activeCompanyId) {
      return "";
    }
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (departmentFilter !== "all") {
      params.set("departmentId", departmentFilter);
    }
    if (positionFilter !== "all") {
      params.set("positionId", positionFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    return `/api/employees/export?${params.toString()}`;
  }, [activeCompanyId, statusFilter, departmentFilter, positionFilter, query]);

  const typeOptions = useMemo(
    () => [
      { value: "full_time", label: t("hr.employees.type.full_time") },
      { value: "part_time", label: t("hr.employees.type.part_time") },
      { value: "contractor", label: t("hr.employees.type.contractor") },
      { value: "temporary", label: t("hr.employees.type.temporary") },
    ],
    [t]
  );

  const terminationCategoryOptions = useMemo(
    () => [
      { value: "employer_termination", label: t("hr.employees.terminationCategory.employer_termination") },
      { value: "resignation", label: t("hr.employees.terminationCategory.resignation") },
      { value: "contract_end", label: t("hr.employees.terminationCategory.contract_end") },
      { value: "force_majeure", label: t("hr.employees.terminationCategory.force_majeure") },
      { value: "retirement", label: t("hr.employees.terminationCategory.retirement") },
      { value: "other", label: t("hr.employees.terminationCategory.other") },
    ],
    [t]
  );

  const displayEmployeeName = (employee: Employee) =>
    locale === "ar" ? employee.nameAr : employee.nameEn;

  const displayDepartmentName = (department?: Department | null) =>
    department ? (locale === "ar" ? department.nameAr : department.nameEn) : "-";

  const displayPositionName = (position?: Position | null) =>
    position ? (locale === "ar" ? position.nameAr : position.nameEn) : "-";

  const managerOptions = useMemo(
    () => employees.filter((employee) => employee.status !== "terminated"),
    [employees]
  );

  const loadEmployees = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingEmployees(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (departmentFilter !== "all") {
      params.set("departmentId", departmentFilter);
    }
    if (positionFilter !== "all") {
      params.set("positionId", positionFilter);
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/employees?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setEmployees(data.employees ?? []))
      .catch(() => setEmployees([]))
      .finally(() => setLoadingEmployees(false));
  }, [activeCompanyId, departmentFilter, positionFilter, query, statusFilter]);

  const loadLookups = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingLookups(true);
    Promise.all([
      fetch(`/api/departments?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/positions?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/users?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([departmentData, positionData, userData]) => {
        setDepartments(departmentData.departments ?? []);
        setPositions(positionData.positions ?? []);
        setUsers(userData.users ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingLookups(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  const resetForm = () => {
    setEmployeeNumber("");
    setNameAr("");
    setNameEn("");
    setNationalId("");
    setIqamaNumber("");
    setPassportNumber("");
    setNationality("");
    setDob("");
    setGender("");
    setEmail("");
    setPhone("");
    setAddress("");
    setHireDate("");
    setDepartmentId("");
    setPositionId("");
    setManagerId("");
    setUserId("");
    setEmploymentType("");
    setStatus("active");
    setTerminationDate("");
    setTerminationCategory("");
    setTerminationReason("");
    setNotes("");
  };

  const handleCreate = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorKey("hr.employees.missingName");
      return;
    }
    if (!hireDate) {
      setErrorKey("hr.employees.missingHireDate");
      return;
    }
    if (status === "terminated" && !terminationDate) {
      setErrorKey("hr.employees.missingTerminationDate");
      return;
    }
    if (status === "terminated" && !terminationCategory) {
      setErrorKey("hr.employees.missingTerminationCategory");
      return;
    }

    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          employeeNumber: employeeNumber.trim() || null,
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          nationalId: nationalId.trim() || null,
          iqamaNumber: iqamaNumber.trim() || null,
          passportNumber: passportNumber.trim() || null,
          nationality: nationality.trim() || null,
          dob: dob || null,
          gender: gender || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          hireDate,
          departmentId: departmentId || null,
          positionId: positionId || null,
          managerId: managerId || null,
          userId: userId || null,
          employmentType: employmentType || null,
          status,
          terminationDate: status === "terminated" ? terminationDate : null,
          terminationCategory: status === "terminated" ? terminationCategory : null,
          terminationReason: status === "terminated" ? terminationReason.trim() || null : null,
          notes: notes.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapEmployeeError(data?.error));
        return;
      }
      resetForm();
      loadEmployees();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("hr.employees.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("hr.employees.subtitle")}</p>
        </div>
        <a
          href={exportUrl || "#"}
          className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
            activeCompanyId ? "" : "pointer-events-none opacity-60"
          }`}
        >
          {t("hr.employees.exportCsv")}
        </a>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("hr.employees.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.statusFilter")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("hr.employees.departmentFilter")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="all">{t("common.all")}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {displayDepartmentName(department)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("hr.employees.positionFilter")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="all">{t("common.all")}</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {displayPositionName(position)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("hr.employees.addTitle")}</h2>
          <span className="text-xs text-muted">{t("common.optional")}</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("hr.employees.employeeNumber")}
            </span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.nameAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.nameEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              required
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.nationalId")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.iqamaNumber")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={iqamaNumber}
              onChange={(event) => setIqamaNumber(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("hr.employees.passportNumber")}
            </span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={passportNumber}
              onChange={(event) => setPassportNumber(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.nationality")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nationality}
              onChange={(event) => setNationality(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.dob")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={dob}
              onChange={(event) => setDob(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.gender")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
            >
              <option value="">{t("common.none")}</option>
              <option value="male">{t("hr.employees.gender.male")}</option>
              <option value="female">{t("hr.employees.gender.female")}</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
            <input
              type="email"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.address")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.hireDate")}</span>
            <input
              type="date"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={hireDate}
              onChange={(event) => setHireDate(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("hr.employees.employmentType")}
            </span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="">{t("common.none")}</option>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "active" | "suspended" | "terminated")
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.department")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="">{t("common.none")}</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {displayDepartmentName(department)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.position")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={positionId}
              onChange={(event) => setPositionId(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="">{t("common.none")}</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {displayPositionName(position)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.manager")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="">{t("common.none")}</option>
              {managerOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {displayEmployeeName(employee)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {status === "terminated" ? (
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("hr.employees.terminationDate")}
              </span>
              <input
                type="date"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("hr.employees.terminationCategory")}
              </span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={terminationCategory}
                onChange={(event) => setTerminationCategory(event.target.value)}
              >
                <option value="">{t("common.none")}</option>
                {terminationCategoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm md:col-span-2 ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("hr.employees.terminationReason")}
              </span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={terminationReason}
                onChange={(event) => setTerminationReason(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.employees.linkedUser")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              disabled={loadingLookups}
            >
              <option value="">{t("common.none")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isPending}
          className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        >
          {t("common.add")}
        </button>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("hr.employees.listTitle")}</span>
          <span className="text-xs text-muted">{employees.length}</span>
        </div>
        {loadingEmployees ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 6 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("hr.employees.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.employees.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.employees.department")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.employees.position")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((employee) => {
                  const department = departments.find((entry) => entry.id === employee.departmentId);
                  const position = positions.find((entry) => entry.id === employee.positionId);
                  return (
                    <tr key={employee.id}>
                      <td className="px-4 py-2">
                        <p className="font-semibold">{displayEmployeeName(employee)}</p>
                        {employee.employeeNumber ? (
                          <p className="text-xs text-muted">{employee.employeeNumber}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">{displayDepartmentName(department)}</td>
                      <td className="px-4 py-2">{displayPositionName(position)}</td>
                      <td className="px-4 py-2">
                        {t(`hr.employees.status.${employee.status}`)}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/hr/employees/${employee.id}`}
                          className="text-xs font-semibold text-foreground underline decoration-dotted"
                        >
                          {t("common.view")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
