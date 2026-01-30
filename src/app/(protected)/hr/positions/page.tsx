"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
  code?: string | null;
  departmentId?: string | null;
  status: "active" | "inactive";
  notes?: string | null;
};

const mapPositionError = (error?: string) => {
  switch (error) {
    case "Duplicate position":
      return "hr.positions.duplicate";
    case "Invalid department":
      return "hr.positions.invalidDepartment";
    default:
      return "error.saveFailed";
  }
};

export default function PositionsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
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
    return `/api/positions/export?companyId=${activeCompanyId}`;
  }, [activeCompanyId]);

  const displayDepartmentName = (department: Department) =>
    locale === "ar" ? department.nameAr : department.nameEn;

  const loadData = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    Promise.all([
      fetch(`/api/positions?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/departments?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([positionData, departmentData]) => {
        setPositions(positionData.positions ?? []);
        setDepartments(departmentData.departments ?? []);
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
    setDepartmentId("");
    setStatus("active");
    setNotes("");
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!activeCompanyId) {
      return;
    }
    if (!nameAr.trim() || !nameEn.trim()) {
      setErrorKey("hr.positions.missingName");
      return;
    }

    setErrorKey(null);
    startTransition(async () => {
      const payload = {
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim(),
        code: code.trim() || null,
        departmentId: departmentId || null,
        status,
        notes: notes.trim() || null,
      };
      const response = await fetch(
        editingId ? `/api/positions/${editingId}` : "/api/positions",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? payload : { ...payload, companyId: activeCompanyId }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapPositionError(data?.error));
        return;
      }
      resetForm();
      loadData();
    });
  };

  const handleEdit = (position: Position) => {
    setEditingId(position.id);
    setNameAr(position.nameAr);
    setNameEn(position.nameEn);
    setCode(position.code ?? "");
    setDepartmentId(position.departmentId ?? "");
    setStatus(position.status);
    setNotes(position.notes ?? "");
  };

  const handleStatusToggle = (position: Position) => {
    startTransition(async () => {
      await fetch(`/api/positions/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: position.status === "active" ? "inactive" : "active",
        }),
      });
      loadData();
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("hr.positions.title")}</h1>
          <p className="text-sm text-muted">{t("hr.positions.subtitle")}</p>
        </div>
        <a
          href={exportUrl || "#"}
          className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
            activeCompanyId ? "" : "pointer-events-none opacity-60"
          }`}
        >
          {t("hr.positions.exportCsv")}
        </a>
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.positions.nameAr")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.positions.nameEn")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.positions.code")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("hr.positions.department")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={loading}
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
            <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            <span className="mb-1 block text-xs text-muted">{t("hr.positions.notes")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {editingId ? t("hr.positions.update") : t("hr.positions.create")}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("hr.positions.listTitle")}</span>
          <span className="text-xs text-muted">{positions.length}</span>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("hr.positions.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.positions.nameAr")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.positions.nameEn")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.positions.code")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("hr.positions.department")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {positions.map((position) => {
                  const department = departments.find(
                    (entry) => entry.id === position.departmentId
                  );
                  return (
                    <tr key={position.id}>
                      <td className="px-4 py-2 font-semibold">{position.nameAr}</td>
                      <td className="px-4 py-2">{position.nameEn}</td>
                      <td className="px-4 py-2">{position.code ?? "-"}</td>
                      <td className="px-4 py-2">
                        {department ? displayDepartmentName(department) : "-"}
                      </td>
                      <td className="px-4 py-2">{t(`status.${position.status}`)}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => handleEdit(position)}
                            className="font-semibold text-primary"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(position)}
                            className="font-semibold text-muted"
                          >
                            {position.status === "active"
                              ? t("hr.positions.deactivate")
                              : t("hr.positions.activate")}
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
