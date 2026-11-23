"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import type { RegistrationRequest } from "@/lib/data/registration-requests";
import { SkeletonBlock } from "@/components/skeleton";

type RequestRow = RegistrationRequest & { nameExists?: boolean };

const STATUS_CLASS: Record<RegistrationRequest["status"], string> = {
  pending: "status-warn",
  approved: "status-good",
  rejected: "status-bad",
};

/** Without a company this is the platform-wide list for system admins. */
export function RegistrationRequests({
  company,
}: {
  company?: { id: string; name: string } | null;
}) {
  const companyId = company?.id ?? null;
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/registrations${companyId ? `?companyId=${companyId}` : ""}`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error("Unauthorized");
        }
        return res.ok ? res.json() : Promise.reject();
      })
      .then((data) => setRequests(data.requests ?? []))
      .catch((err) => {
        setError(
          err instanceof Error && err.message === "Unauthorized"
            ? t("admin.registrations.errors.ownerOnly")
            : t("admin.errors.loadFailed")
        );
      })
      .finally(() => setLoading(false));
  }, [t, companyId]);

  const filtered = useMemo(() => {
    return requests.filter((req) => {
      if (statusFilter !== "all" && req.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [requests, statusFilter]);

  const mapActionError = (message?: string) => {
    switch (message) {
      case "Already a member":
        return t("admin.registrations.errors.alreadyMember");
      case "Plan user limit reached":
        return t("admin.registrations.errors.userLimit");
      case "Subscription inactive":
        return t("admin.registrations.errors.subscriptionInactive");
      case "Company not found":
        return t("admin.registrations.errors.companyNotFound");
      case "Company is not active":
        return t("admin.registrations.errors.companyInactive");
      case "Request is not pending":
        return t("admin.registrations.errors.notPending");
      default:
        return t("admin.errors.updateFailed");
    }
  };

  const handleApprove = async (id: string, companyName: string) => {
    if (!window.confirm(t("admin.registrations.approveConfirm", { company: companyName }))) return;

    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(mapActionError(data?.error));
        return;
      }
      setError(null);

      setRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "approved", processedAt: new Date() } : req
        )
      );
    } catch {
      setError(t("admin.errors.updateFailed"));
    }
  };

  const handleReject = async (id: string, companyName: string) => {
    if (!window.confirm(t("admin.registrations.rejectConfirm", { company: companyName }))) return;

    try {
      const res = await fetch(`/api/admin/registrations/${id}/reject`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(mapActionError(data?.error));
        return;
      }
      setError(null);

      setRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: "rejected", processedAt: new Date() } : req
        )
      );
    } catch {
      setError(t("admin.errors.updateFailed"));
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-64" />
          <SkeletonBlock className="h-4 w-96" />
        </div>
        <div className="panel space-y-3 p-5">
          {[1, 2, 3, 4].map((row) => (
            <SkeletonBlock key={row} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("admin.registrations.title")}</h1>
          <p className="text-sm text-muted page-subtitle">
            {company
              ? t("admin.registrations.tenantScope", { company: company.name })
              : t("admin.registrations.platformScope")}
          </p>
        </div>
        <select
          className="border px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label={t("admin.registrations.status")}
        >
          <option value="all">{t("admin.filters.all")}</option>
          <option value="pending">{t("admin.filters.pending")}</option>
          <option value="approved">{t("admin.filters.approved")}</option>
          <option value="rejected">{t("admin.filters.rejected")}</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-[#fbe6e4] px-3.5 py-2.5 text-sm text-[#8f2a23]">
          {error}
        </p>
      ) : null}

      <div className="panel overflow-x-auto">
        <table className={`table-modern min-w-full text-sm ${alignClass}`}>
          <thead>
            <tr>
              <th className="px-4 py-2">{t("admin.registrations.company")}</th>
              <th className="px-4 py-2">{t("admin.registrations.applicant")}</th>
              <th className="px-4 py-2">{t("admin.registrations.status")}</th>
              <th className="px-4 py-2">{t("admin.registrations.date")}</th>
              <th className="px-4 py-2">{t("admin.common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t("admin.registrations.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((req) => (
                <tr key={req.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{req.companyName}</div>
                    <div className="text-xs text-muted">
                      {req.companyId || req.kind === "join"
                        ? t("admin.registrations.kindJoin", { role: t(`role.${req.requestedRole}`) })
                        : t("admin.registrations.kindNew")}
                    </div>
                    {req.crNumber ? (
                      <div className="text-xs text-muted">
                        {t("auth.register.crNumber")}: <bdi>{req.crNumber}</bdi>
                      </div>
                    ) : null}
                    {req.vatNumber ? (
                      <div className="text-xs text-muted">
                        {t("auth.register.vatNumber")}: <bdi>{req.vatNumber}</bdi>
                      </div>
                    ) : null}
                    {req.nameExists && req.status === "pending" && req.kind !== "join" ? (
                      <div className="mt-1 text-xs text-[#7a4d00]">
                        {t("admin.registrations.nameExists")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div>{req.name}</div>
                    <div className="text-xs text-muted">
                      <bdi>{req.email}</bdi>
                    </div>
                    {req.phone ? (
                      <div className="text-xs text-muted">
                        <bdi>{req.phone}</bdi>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`status ${STATUS_CLASS[req.status]}`}>
                      {t(`admin.registrations.status.${req.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(req.createdAt).toLocaleDateString(
                      locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
                      { timeZone: "Asia/Riyadh" }
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {req.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleApprove(req.id, req.companyName)}
                          className="btn-primary"
                        >
                          {t("admin.registrations.approve")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(req.id, req.companyName)}
                          className="btn-secondary"
                        >
                          {t("admin.registrations.reject")}
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
