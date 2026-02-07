"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { RegistrationRequest } from "@/lib/data/registration-requests";
import { useRouter } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";

export default function AdminRegistrationsPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { activeCompany } = useCompany();

  // Basic client-side permission check (server-side check should be in API)
  useEffect(() => {
    if (activeCompany && !["owner", "admin"].includes(activeCompany.role)) {
      router.push("/dashboard");
    }
  }, [activeCompany, router]);

  useEffect(() => {
    fetch("/api/admin/registrations")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
            // Handle unauthorized access gracefully
            throw new Error("Unauthorized");
        }
        return res.ok ? res.json() : Promise.reject();
      })
      .then((data) => setRequests(data.requests ?? []))
      .catch((err) => {
        console.error(err);
        setError(t("admin.errors.loadFailed"));
      })
      .finally(() => setLoading(false));
  }, [t]);

  const filtered = useMemo(() => {
    return requests.filter((req) => {
      if (statusFilter !== "all" && req.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [requests, statusFilter]);

  const handleApprove = async (id: string, companyName: string) => {
    if (!window.confirm(t("admin.registrations.approveConfirm", { company: companyName }))) return;

    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();

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
      if (!res.ok) throw new Error();

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
        <div className="flex items-center justify-between">
          <div>
            <SkeletonBlock className="h-8 w-64 mb-2" />
            <SkeletonBlock className="h-4 w-96" />
          </div>
          <SkeletonBlock className="h-10 w-32" />
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="flex gap-4">
              <SkeletonBlock className="h-4 w-1/5" />
              <SkeletonBlock className="h-4 w-1/5" />
              <SkeletonBlock className="h-4 w-1/5" />
              <SkeletonBlock className="h-4 w-1/5" />
              <SkeletonBlock className="h-4 w-1/5" />
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="px-6 py-4">
                <div className="flex gap-4">
                  <div className="w-1/5 space-y-2">
                    <SkeletonBlock className="h-5 w-3/4" />
                    <SkeletonBlock className="h-4 w-1/2" />
                  </div>
                  <div className="w-1/5 space-y-2">
                    <SkeletonBlock className="h-5 w-3/4" />
                    <SkeletonBlock className="h-4 w-1/2" />
                  </div>
                  <div className="w-1/5">
                    <SkeletonBlock className="h-6 w-24 rounded-full" />
                  </div>
                  <div className="w-1/5">
                    <SkeletonBlock className="h-4 w-24" />
                  </div>
                  <div className="w-1/5 flex gap-2">
                    <SkeletonBlock className="h-8 w-20" />
                    <SkeletonBlock className="h-8 w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.registrations.title")}</h1>
          <p className="text-gray-500">{t("admin.registrations.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <select
            className="border rounded p-2 bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t("admin.filters.all")}</option>
            <option value="pending">{t("admin.filters.pending")}</option>
            <option value="approved">{t("admin.filters.approved")}</option>
            <option value="rejected">{t("admin.filters.rejected")}</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className={`w-full ${alignClass}`}>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">
                {t("admin.registrations.company")}
              </th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">
                {t("admin.registrations.applicant")}
              </th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">
                {t("admin.registrations.status")}
              </th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">
                {t("admin.registrations.date")}
              </th>
              <th className="px-6 py-3 text-sm font-medium text-gray-500">
                {t("admin.common.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  {t("admin.lists.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((req) => (
                <tr key={req.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      {req.companyName}
                    </div>
                    <div className="text-sm text-gray-500">{req.requestedRole}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-gray-900">{req.name}</div>
                    <div className="text-sm text-gray-500">{req.email}</div>
                    {req.phone && (
                      <div className="text-sm text-gray-500">{req.phone}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        req.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : req.status === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {t(`admin.registrations.status.${req.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(req.createdAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium">
                    {req.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(req.id, req.companyName)}
                          className="text-green-600 hover:text-green-900"
                        >
                          {t("admin.registrations.approve")}
                        </button>
                        <button
                          onClick={() => handleReject(req.id, req.companyName)}
                          className="text-red-600 hover:text-red-900"
                        >
                          {t("admin.registrations.reject")}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
