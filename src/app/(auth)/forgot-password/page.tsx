"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export default function ForgotPasswordPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("idle");
    startTransition(async () => {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      });
      if (!response.ok) {
        setStatus("error");
        return;
      }
      setStatus("sent");
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 py-6 lg:py-8">
      <div className={`mb-6 ${alignClass}`}>
        <p className="text-xs text-muted">{t("app.name")}</p>
        <h1 className="text-2xl font-semibold">{t("auth.forgot.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.forgot.subtitle")}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.email")}
          </span>
          <input
            type="email"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {status === "sent" ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t("auth.forgot.sent")}
          </div>
        ) : null}
        {status === "error" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t("auth.forgot.error")}
          </div>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? t("common.loading") : t("auth.forgot.submit")}
        </button>
      </form>
      <div className="mt-auto pt-4">
        <p className="text-xs text-muted">
          {t("auth.forgot.backToLogin")}{" "}
          <Link className="font-semibold text-foreground" href="/login">
            {t("auth.forgot.loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
