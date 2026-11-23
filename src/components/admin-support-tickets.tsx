"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";

const STATUS_OPTIONS = ["open", "in_progress", "resolved", "closed"] as const;

type Ticket = {
  id: string;
  companyName: string;
  userEmail?: string | null;
  subject: string;
  category: string;
  priority: string;
  message: string;
  status: (typeof STATUS_OPTIONS)[number];
  replies: Array<{ message: string; authorEmail: string | null; createdAt: string }>;
  createdAt: string;
};

export function AdminSupportTickets() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("open");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadTickets = useCallback(
    () =>
      fetch("/api/admin/support/tickets")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setTickets(data.tickets ?? []))
        .catch(() => setError(t("admin.errors.loadFailed")))
        .finally(() => setLoading(false)),
    [t]
  );

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const updateTicket = (ticketId: string, payload: { status?: string; reply?: string }) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setError(t("admin.errors.updateFailed"));
        return;
      }
      if (payload.reply) {
        setReplies((prev) => ({ ...prev, [ticketId]: "" }));
      }
      await loadTickets();
    });
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleString(locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US", {
      timeZone: "Asia/Riyadh",
      dateStyle: "medium",
      timeStyle: "short",
    });

  const visible = tickets.filter(
    (ticket) => statusFilter === "all" || ticket.status === statusFilter
  );

  return (
    <div className={`app-card p-6 ${alignClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("admin.support.ticketsTitle")}</h2>
        <select
          className="rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">{t("common.all")}</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`support.status.${option}`)}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="mt-3 text-xs text-red-500">{error}</p> : null}
      {loading ? (
        <div className="mt-4 space-y-3">
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-16 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("support.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {visible.map((ticket) => (
            <li key={ticket.id} className="rounded-2xl border border-border p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{ticket.subject}</p>
                  <p className="text-xs text-muted">
                    {ticket.companyName} · {ticket.userEmail ?? "-"} · {formatDate(ticket.createdAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {t(`support.category.${ticket.category}`)} ·{" "}
                    {t(`support.priority.${ticket.priority}`)}
                  </p>
                </div>
                <select
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                  value={ticket.status}
                  onChange={(event) => updateTicket(ticket.id, { status: event.target.value })}
                  disabled={isPending}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {t(`support.status.${option}`)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 whitespace-pre-wrap">{ticket.message}</p>
              {ticket.replies.map((reply, index) => (
                <div key={index} className="mt-3 rounded-xl bg-surface-muted p-3 text-xs">
                  <p className="text-muted">
                    {reply.authorEmail ?? "-"} · {formatDate(reply.createdAt)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{reply.message}</p>
                </div>
              ))}
              <textarea
                className="mt-3 min-h-[72px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                placeholder={t("admin.support.replyPlaceholder")}
                value={replies[ticket.id] ?? ""}
                onChange={(event) =>
                  setReplies((prev) => ({ ...prev, [ticket.id]: event.target.value }))
                }
              />
              <button
                type="button"
                className="mt-2 rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast disabled:opacity-60"
                disabled={isPending || (replies[ticket.id] ?? "").trim().length < 2}
                onClick={() => updateTicket(ticket.id, { reply: replies[ticket.id]?.trim() })}
              >
                {t("admin.support.sendReply")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
