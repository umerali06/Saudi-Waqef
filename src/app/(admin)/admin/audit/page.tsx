"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type AuditEvent = {
  id: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  createdAt: string;
};

export default function AdminAuditPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/audit")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setError(t("admin.errors.loadFailed")));
  }, [t]);

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("admin.audit.title")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("admin.audit.subtitle")}</p>
        </div>
        <a
          href="/api/admin/audit/export"
          className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
        >
          {t("admin.audit.exportCsv")}
        </a>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <div className="app-card card-modern">
        <div className={`border-b border-border px-4 py-3 text-sm font-semibold ${alignClass}`}>
          {t("admin.audit.listTitle")}
        </div>
        {events.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted page-subtitle">{t("admin.audit.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("admin.audit.column.date")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("admin.audit.column.user")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("admin.audit.column.action")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("admin.audit.column.entity")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("admin.audit.column.entityId")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className={`px-4 py-2 ${alignClass}`}>{event.createdAt}</td>
                    <td className={`px-4 py-2 ${alignClass}`}>{event.userEmail ?? "--"}</td>
                    <td className={`px-4 py-2 ${alignClass}`}>{event.action}</td>
                    <td className={`px-4 py-2 ${alignClass}`}>{event.entity}</td>
                    <td className={`px-4 py-2 ${alignClass}`}>{event.entityId ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
