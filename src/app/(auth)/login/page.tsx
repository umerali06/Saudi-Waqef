"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";

export default function LoginPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [showSetupLink, setShowSetupLink] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const mfaInputRef = useRef<HTMLInputElement | null>(null);
  const mfaLookupAbortRef = useRef<AbortController | null>(null);
  const mfaLookupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/setup/status")
      .then((res) => res.json())
      .then((data) => setShowSetupLink(!data.hasUsers))
      .catch(() => setShowSetupLink(false))
      .finally(() => setSetupLoading(false));
  }, []);

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setMfaRequired(false);
      return;
    }
    if (mfaLookupTimerRef.current) {
      clearTimeout(mfaLookupTimerRef.current);
    }
    mfaLookupTimerRef.current = setTimeout(() => {
      if (mfaLookupAbortRef.current) {
        mfaLookupAbortRef.current.abort();
      }
      const controller = new AbortController();
      mfaLookupAbortRef.current = controller;
      fetch(`/api/auth/mfa-status?email=${encodeURIComponent(normalized)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data) => setMfaRequired(Boolean(data?.mfaEnabled)))
        .catch(() => null);
    }, 350);
    return () => {
      if (mfaLookupTimerRef.current) {
        clearTimeout(mfaLookupTimerRef.current);
      }
    };
  }, [email]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    startTransition(async () => {
      const response = await signIn("credentials", {
        redirect: false,
        email,
        password,
        otp: mfaRequired ? otp : "",
      });

      if (response?.error) {
        const errorMap: Record<string, string> = {
          AUTH_LOCKED: "auth.login.error.locked",
          AUTH_MFA_REQUIRED: "auth.login.error.mfaRequired",
          AUTH_MFA_INVALID: "auth.login.error.mfaInvalid",
          AUTH_INVALID_CREDENTIALS: "error.invalidCredentials",
        };
        if (response.error === "AUTH_MFA_REQUIRED") {
          setMfaRequired(true);
          requestAnimationFrame(() => mfaInputRef.current?.focus());
        }
        setErrorKey(errorMap[response.error] ?? "error.invalidCredentials");
        return;
      }

      router.replace("/");
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 py-6 lg:py-8">
      <div className={`mb-6 ${alignClass}`}>
        <p className="text-xs text-muted">{t("app.name")}</p>
        <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
        <p className="mt-2 text-sm text-muted">
          {t("auth.login.subtitle")}
        </p>
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
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.password")}
          </span>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 pr-20 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted transition hover:text-foreground"
            >
              {showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
            </button>
          </div>
        </label>
        {mfaRequired ? (
          <label className="block text-sm">
            <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
              {t("auth.login.mfaLabel")}
            </span>
            <input
              ref={mfaInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder={t("auth.login.mfaPlaceholder")}
              required
            />
            <span className="mt-1 block text-[11px] text-muted">
              {t("auth.login.mfaHint")}
            </span>
          </label>
        ) : null}
        {errorKey ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? t("common.loading") : t("auth.login.title")}
        </button>
      </form>
      <div className="mt-auto pt-4">
      {setupLoading ? (
        <div className="mt-4 space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-muted" />
        </div>
      ) : showSetupLink ? (
        <p className="mt-4 text-xs text-muted">
          {t("auth.login.noAdmin")}{" "}
          <Link className="font-semibold text-foreground" href="/setup">
            {t("auth.login.setupLink")}
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted">
          {t("auth.login.helpText")}{" "}
          <Link className="font-semibold text-foreground" href="/forgot-password">
            {t("auth.login.forgotLink")}
          </Link>
        </p>
      )}
      </div>
    </div>
  );
}
