"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export default function ForgotPasswordPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSentTo(null);
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, locale }),
      }).catch(() => null);
      if (!response?.ok) {
        setErrorKey(
          response?.status === 429
            ? "auth.forgot.tooMany"
            : response?.status === 502
            ? "auth.forgot.emailFailed"
            : "auth.forgot.error"
        );
        return;
      }
      setSentTo(email.trim());
      setWait(60);
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
        {sentTo ? (
          <div
            role="status"
            className="space-y-2 rounded-lg bg-[#e3f3ea] px-3.5 py-2.5 text-sm leading-6 text-[#0b5c3d]"
          >
            <p className="break-words">{t("auth.forgot.sent", { email: sentTo })}</p>
            <p>
              {t("auth.forgot.noAccount")}{" "}
              <Link className="font-semibold underline" href="/register">
                {t("auth.forgot.requestAccount")}
              </Link>
              .
            </p>
          </div>
        ) : null}
        {errorKey ? (
          <div role="alert" className="rounded-lg bg-[#fbe6e4] px-3.5 py-2.5 text-sm text-[#8f2a23]">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="btn-primary auth-submit"
          disabled={isPending || wait > 0}
        >
          {isPending
            ? t("common.loading")
            : wait > 0
            ? t("auth.forgot.resendIn", { seconds: String(wait) })
            : t("auth.forgot.submit")}
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
