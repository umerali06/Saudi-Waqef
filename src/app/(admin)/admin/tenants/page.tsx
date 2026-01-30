"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Tenant = {
  id: string;
  name: string;
  status: "active" | "suspended";
  currency: string;
  defaultLanguage: "ar" | "en";
  createdAt: string;
  userCount: number;
  ownerId?: string | null;
  ownerEmail?: string | null;
  subscriptionStatus?: string | null;
  planName?: string | null;
};

export default function AdminTenantsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/tenants")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setTenants(data.tenants ?? []))
      .catch(() => setError(t("admin.errors.loadFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tenants.filter((tenant) => {
      if (statusFilter !== "all" && tenant.status !== statusFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        tenant.name.toLowerCase().includes(needle) ||
        tenant.id.toLowerCase().includes(needle) ||
        (tenant.ownerEmail ?? "").toLowerCase().includes(needle)
      );
    });
  }, [tenants, query, statusFilter]);

  const updateStatus = async (tenant: Tenant, nextStatus: "active" | "suspended") => {
    const confirmed = window.confirm(
      nextStatus === "suspended"
        ? t("admin.tenants.suspendConfirm", { name: tenant.name })
        : t("admin.tenants.activateConfirm", { name: tenant.name })
    );
    if (!confirmed) {
      return;
    }
    const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      setError(t("admin.errors.updateFailed"));
      return;
    }
    setTenants((prev) =>
      prev.map((item) =>
        item.id === tenant.id ? { ...item, status: nextStatus } : item
      )
    );
  };

  const handleImpersonate = async (tenant: Tenant) => {
    if (!tenant.ownerId) {
      setError(t("admin.tenants.noOwner"));
      return;
    }
    const reason = window.prompt(t("admin.tenants.impersonateReason")) ?? "";
    const response = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUserId: tenant.ownerId,
        companyId: tenant.id,
        reason,
      }),
    });
    if (!response.ok) {
      setError(t("admin.errors.updateFailed"));
      return;
    }
    window.location.href = "/";
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("admin.tenants.title")}</h1>
          <p className="text-sm text-muted">{t("admin.tenants.subtitle")}</p>
        </div>
        <a
          href={`/api/admin/tenants/export?status=${statusFilter}&q=${encodeURIComponent(
            query.trim()
          )}`}
          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
        >
          {t("admin.tenants.exportCsv")}
        </a>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className={`app-card p-4 ${alignClass}`}>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.tenants.search")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.tenants.status")}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="all">{t("common.all")}</option>
              <option value="active">{t("admin.status.active")}</option>
              <option value="suspended">{t("admin.status.suspended")}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="app-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("admin.tenants.listTitle")}
        </div>
        {loading ? (
          <p className="px-4 py-4 text-sm text-muted">{t("common.loading")}</p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">{t("admin.tenants.empty")}</p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((tenant) => (
              <div key={tenant.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{tenant.name}</p>
                    <p className="text-xs text-muted">{tenant.id}</p>
                    <p className="text-xs text-muted">
                      {t("admin.tenants.owner")}:{" "}
                      {tenant.ownerEmail ?? t("common.na")}
                    </p>
                  </div>
                  <div className={`text-xs text-muted ${alignClass}`}>
                    <p>
                      {t("admin.tenants.users")}: {tenant.userCount}
                    </p>
                    <p>
                      {t("admin.tenants.plan")}:{" "}
                      {tenant.planName ?? t("common.na")}
                    </p>
                    <p>
                      {t("admin.tenants.subscription")}:{" "}
                      {tenant.subscriptionStatus ?? t("common.na")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {tenant.status === "active" ? (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600"
                        onClick={() => updateStatus(tenant, "suspended")}
                      >
                        {t("admin.tenants.suspend")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cursor-pointer rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700"
                        onClick={() => updateStatus(tenant, "active")}
                      >
                        {t("admin.tenants.activate")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground"
                      onClick={() => handleImpersonate(tenant)}
                    >
                      {t("admin.tenants.impersonate")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
