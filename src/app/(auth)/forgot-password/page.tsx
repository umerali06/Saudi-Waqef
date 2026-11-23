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
    <div className="flex flex-col">
      <div className={`mb-6 ${alignClass}`}>
        <h1 className="text-[1.7rem] font-semibold leading-tight">{t("auth.forgot.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.forgot.subtitle")}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.email")}
          </span>
          <input
            type="email"
            dir="ltr"
            className="auth-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        {status === "sent" ? (
          <div className="rounded-lg bg-[#e3f3ea] px-3.5 py-2.5 text-sm text-[#0b5c3d]">
            {t("auth.forgot.sent")}
          </div>
        ) : null}
        {status === "error" ? (
          <div className="rounded-lg bg-[#fbe6e4] px-3.5 py-2.5 text-sm text-[#8f2a23]">
            {t("auth.forgot.error")}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn-primary auth-submit"
          disabled={isPending}
        >
          {isPending ? t("common.loading") : t("auth.forgot.submit")}
        </button>
      </form>
      <div className="pt-6">
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
