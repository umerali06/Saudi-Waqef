"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Department = {
  id: string;
  nameAr: string;
  nameEn: string;
  code?: string | null;
  managerId?: string | null;
  status: "active" | "inactive";
  notes?: string | null;
};

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "suspended" | "terminated";
};

const mapDepartmentError = (error?: string) => {
  switch (error) {
    case "Duplicate department":
      return "hr.departments.duplicate";
    case "Invalid manager":
      return "hr.departments.invalidManager";
    default:
      return "error.saveFailed";
  }
};

export default function DepartmentsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [managerId, setManagerId] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const exportUrl = useMemo(() => {
    if (!activeCompanyId) {
      return "";
    }
    return `/api/departments/export?companyId=${activeCompanyId}`;
  }, [activeCompanyId]);

  const managerOptions = useMemo(
    () => employees.filter((employee) => employee.status !== "terminated"),
    [employees]
  );

  const displayEmployeeName = (employee: Employee) =>
    locale === "ar" ? employee.nameAr : employee.nameEn;

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/departments?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/employees?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([departmentData, employeeData]) => {
        setDepartments(departmentData.departments ?? []);
        setEmployees(employeeData.employees ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoading(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setNameAr("");
    setNameEn("");
    setCode("");
    setManagerId("");
    setStatus("active");
    setNotes("");
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorKey("hr.departments.missingName");
      return;
    }

    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        code: code.trim() || null,
        managerId: managerId || null,
        status,
        notes: notes.trim() || null,
      };
      const response = await fetch(
        editingId ? `/api/departments/${editingId}` : "/api/departments",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            editingId ? payload : { ...payload, companyId: activeCompanyId }
          ),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapDepartmentError(data?.error));
        return;
      }
      resetForm();
      loadData();
    });
  };

  const handleEdit = (department: Department) => {
    setEditingId(department.id);
    setNameAr(department.nameAr);
    setNameEn(department.nameEn);
    setCode(department.code ?? "");
    setManagerId(department.managerId ?? "");
    setStatus(department.status);
    setNotes(department.notes ?? "");
  };

  const handleStatusToggle = (department: Department) => {
    startTransition(async () => {
      await fetch(`/api/departments/${department.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: department.status === "active" ? "inactive" : "active",
        }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("hr.departments.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("hr.departments.subtitle")}</p>
        </div>
        <a
          href={exportUrl || "#"}
          className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
            activeCompanyId ? "" : "pointer-events-none opacity-60"
          }`}
        >
          {t("hr.departments.exportCsv")}
        </a>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.departments.nameAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.departments.nameEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.departments.code")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.departments.manager")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={managerId}
              onChange={(event) => setManagerId(event.target.value)}
              disabled={loading}
            >
              <option value="">{t("common.none")}</option>
              {managerOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {displayEmployeeName(employee)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
              disabled={loading}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.departments.notes")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {editingId ? t("hr.departments.update") : t("hr.departments.create")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("hr.departments.listTitle")}</span>
          <span className="text-xs text-muted">{departments.length}</span>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : departments.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("hr.departments.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.departments.nameAr")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.departments.nameEn")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.departments.code")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.departments.manager")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {departments.map((department) => {
                  const manager = employees.find((employee) => employee.id === department.managerId);
                  return (
                    <tr key={department.id}>
                      <td className="px-4 py-2 font-semibold">{department.nameAr}</td>
                      <td className="px-4 py-2">{department.nameEn}</td>
                      <td className="px-4 py-2">{department.code ?? "-"}</td>
                      <td className="px-4 py-2">
                        {manager ? displayEmployeeName(manager) : "-"}
                      </td>
                      <td className="px-4 py-2">{t(`status.${department.status}`)}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(department)}
                            className="font-semibold text-primary"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(department)}
                            className="font-semibold text-muted"
                          >
                            {department.status === "active"
                              ? t("hr.departments.deactivate")
                              : t("hr.departments.activate")}
                          </button>
                        </div>
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
