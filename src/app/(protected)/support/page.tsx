"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

const CATEGORY_OPTIONS = [
  "billing",
  "technical",
  "data",
  "access",
  "onboarding",
  "other",
] as const;

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"] as const;

type Ticket = {
  id: string;
  companyId: string;
  userEmail?: string | null;
  subject: string;
  category: (typeof CATEGORY_OPTIONS)[number];
  priority: (typeof PRIORITY_OPTIONS)[number];
  message: string;
  status: (typeof STATUS_OPTIONS)[number];
  createdAt: string;
};

export default function SupportPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]>("technical");
  const [priority, setPriority] = useState<(typeof PRIORITY_OPTIONS)[number]>("medium");
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAdmin = useMemo(
    () => ["owner", "admin"].includes(activeCompany?.role ?? ""),
    [activeCompany?.role]
  );

  const loadTickets = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingTickets(true);
    setErrorKey(null);
    fetch(`/api/support/tickets?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setTickets(data?.tickets ?? []))
      .catch(() => setErrorKey("support.errors.loadFailed"))
      .finally(() => setLoadingTickets(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setSuccessKey(null);
    startTransition(async () => {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          subject,
          category,
          priority,
          message,
          locale,
        }),
      });
      if (!response.ok) {
        setErrorKey("support.errors.createFailed");
        return;
      }
      setSubject("");
      setCategory("technical");
      setPriority("medium");
      setMessage("");
      setSuccessKey("support.success");
      loadTickets();
    });
  };

  const handleStatusUpdate = (ticketId: string, status: Ticket["status"]) => {
    startTransition(async () => {
      const response = await fetch(`/api/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setErrorKey("support.errors.updateFailed");
        return;
      }
      loadTickets();
    });
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(new Date(value));

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const matchesSearch = search.trim()
        ? `${ticket.subject} ${ticket.message}`.toLowerCase().includes(search.trim().toLowerCase())
        : true;
      const matchesStatus = statusFilter ? ticket.status === statusFilter : true;
      const matchesCategory = categoryFilter ? ticket.category === categoryFilter : true;
      const matchesPriority = priorityFilter ? ticket.priority === priorityFilter : true;
      return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
    });
  }, [tickets, search, statusFilter, categoryFilter, priorityFilter]);

  const statusStyles: Record<Ticket["status"], string> = {
    open: "bg-sky-100 text-sky-700",
    in_progress: "bg-amber-100 text-amber-700",
    resolved: "bg-emerald-100 text-emerald-700",
    closed: "bg-slate-200 text-slate-700",
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setCategoryFilter("");
    setPriorityFilter("");
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t("support.title")}</h1>
          <p className="text-sm text-muted">{t("support.subtitle")}</p>
        </div>
        <Link
          href="/help"
          className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
        >
          {t("support.helpLink")}
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("support.formTitle")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("support.subject")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("support.category")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as (typeof CATEGORY_OPTIONS)[number])
              }
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`support.category.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("support.priority")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as (typeof PRIORITY_OPTIONS)[number])
              }
            >
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`support.priority.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass} md:col-span-2`}>
            <span className="mb-1 block text-xs text-muted">{t("support.message")}</span>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {successKey ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t(successKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("support.submit")}
        </button>
      </form>

      <div className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{t("support.listTitle")}</p>
            <p className="text-xs text-muted">
              {t("support.listCount", { count: String(filteredTickets.length) })}
            </p>
          </div>
          {isAdmin ? (
            <a
              href={
                activeCompanyId ? `/api/support/tickets/export?companyId=${activeCompanyId}` : "#"
              }
              className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("support.exportCsv")}
            </a>
          ) : null}
        </div>
        <div className="border-b border-border px-4 py-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-xs">
              <span className="mb-1 block text-[11px] text-muted">{t("support.search")}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                placeholder={t("support.searchPlaceholder")}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[11px] text-muted">
                {t("support.filters.category")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="">{t("common.all")}</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`support.category.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[11px] text-muted">
                {t("support.filters.priority")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                <option value="">{t("common.all")}</option>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`support.priority.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-[11px] text-muted">
                {t("support.filters.status")}
              </span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">{t("common.all")}</option>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`support.status.${option}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(search || statusFilter || categoryFilter || priorityFilter) && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-semibold text-muted transition hover:text-foreground"
            >
              {t("support.filters.clear")}
            </button>
          )}
        </div>
        {loadingTickets ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-3 w-48" />
                <SkeletonBlock className="h-3 w-72" />
                <SkeletonBlock className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("support.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.subject")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.category")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.priority")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.createdAt")}</th>
                  {isAdmin ? (
                    <th className={`px-4 py-2 ${alignClass}`}>{t("support.table.actions")}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="px-4 py-2">
                      <div className="font-semibold">{ticket.subject}</div>
                      <div className="text-xs text-muted">{ticket.userEmail ?? ""}</div>
                      <div className="mt-1 text-xs text-muted">{ticket.message}</div>
                    </td>
                    <td className="px-4 py-2">{t(`support.category.${ticket.category}`)}</td>
                    <td className="px-4 py-2">{t(`support.priority.${ticket.priority}`)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] ${statusStyles[ticket.status]}`}
                      >
                        {t(`support.status.${ticket.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2">{formatDate(ticket.createdAt)}</td>
                    {isAdmin ? (
                      <td className="px-4 py-2">
                        <select
                          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                          value={ticket.status}
                          onChange={(event) =>
                            handleStatusUpdate(
                              ticket.id,
                              event.target.value as Ticket["status"]
                            )
                          }
                          disabled={isPending}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {t(`support.status.${option}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                    ) : null}
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
