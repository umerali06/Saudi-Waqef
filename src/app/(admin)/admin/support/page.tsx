"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "@/i18n/provider";

export default function AdminSupportPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleReset = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/support/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, email, password }),
      });
      if (!response.ok) {
        setError(t("admin.support.resetFailed"));
        return;
      }
      setMessage(t("admin.support.resetSuccess"));
      setPassword("");
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("admin.support.title")}</h1>
        <p className="text-sm text-muted">{t("admin.support.subtitle")}</p>
      </div>

      <form onSubmit={handleReset} className={`app-card p-4 ${alignClass}`}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.support.userId")}</span>
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              placeholder={t("admin.support.userIdPlaceholder")}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.support.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              placeholder={t("admin.support.emailPlaceholder")}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.support.newPassword")}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              required
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("admin.support.resetPassword")}
          </button>
        </div>
        {message ? <p className="mt-2 text-xs text-emerald-600">{message}</p> : null}
        {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      </form>
    </section>
  );
}
