"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";
import { suggestEmail } from "@/lib/utils/email-suggestion";

const inputClass = "auth-input";

type LoginError = { key: string; params?: Record<string, string> };

const toLoginError = (code: string): LoginError => {
  const [name, detail] = code.split(":");
  switch (name) {
    case "AUTH_LOCKED":
      return detail
        ? { key: "auth.login.error.lockedFor", params: { minutes: detail } }
        : { key: "auth.login.error.locked" };
    case "AUTH_MFA_REQUIRED":
      return { key: "auth.login.error.mfaRequired" };
    case "AUTH_MFA_INVALID":
      return { key: "auth.login.error.mfaInvalid" };
    case "AUTH_MFA_BROKEN":
      return { key: "auth.login.error.mfaBroken" };
    case "AUTH_INVALID_CREDENTIALS":
      return { key: "auth.login.error.credentials" };
    default:
      return { key: "auth.login.error.unavailable" };
  }
};

export default function LoginPage() {
  const { t } = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [otp, setOtp] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [showSetupLink, setShowSetupLink] = useState(false);
  const [pending, setPending] = useState(false);
  const otpRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/setup/status")
      .then((res) => res.json())
      .then((data) => setShowSetupLink(data.hasUsers === false))
      .catch(() => setShowSetupLink(false));
  }, []);

  useEffect(() => {
    if (mfaRequired) otpRef.current?.focus();
  }, [mfaRequired]);

  const suggestion = suggestEmail(email);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await signIn("credentials", {
        redirect: false,
        email: email.trim(),
        password,
        otp: mfaRequired ? otp : "",
      });
      if (response?.ok && !response.error) {
        // A full navigation, so nothing cached while signed out is reused.
        window.location.assign("/dashboard");
        return;
      }
      const code = response?.error ?? "";
      if (code === "AUTH_MFA_REQUIRED") setMfaRequired(true);
      setError(toLoginError(code));
    } catch {
      setError({ key: "auth.login.error.unavailable" });
    }
    setPending(false);
  };

  return (
    <>
      <h1 className="text-[1.7rem] font-semibold leading-tight">{t("auth.login.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("auth.login.subtitle")}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            {t("common.email")}
          </label>
          <input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {suggestion ? (
            <button
              type="button"
              className="mt-1.5 text-xs font-medium text-primary underline underline-offset-4"
              onClick={() => setEmail(suggestion)}
            >
              {t("auth.login.didYouMean", { email: suggestion })}
            </button>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="text-sm font-medium">
              {t("common.password")}
            </label>
            <Link className="text-xs font-medium text-primary hover:underline" href="/forgot-password">
              {t("auth.login.helpText")}
            </Link>
          </div>
          <div className="relative" dir="ltr">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              dir="ltr"
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              className={`${inputClass} pe-20`}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 end-3 text-xs font-medium text-muted hover:text-foreground"
            >
              {showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
            </button>
          </div>
          {capsLock ? <p className="mt-1.5 text-xs text-[#7a4d00]">{t("auth.login.capsLock")}</p> : null}
        </div>

        {mfaRequired ? (
          <div>
            <label htmlFor="otp" className="mb-1.5 block text-sm font-medium">
              {t("auth.login.mfaLabel")}
            </label>
            <input
              id="otp"
              ref={otpRef}
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              className={inputClass}
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder={t("auth.login.mfaPlaceholder")}
              required
            />
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-[#fbe6e4] px-3.5 py-2.5 text-sm text-[#8f2a23]">
            {t(error.key, error.params)}
          </p>
        ) : null}

        <button type="submit" className="btn-primary auth-submit" disabled={pending}>
          {pending ? t("common.loading") : t("auth.login.title")}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted">
        {showSetupLink ? (
          <>
            {t("auth.login.noAdmin")}{" "}
            <Link className="font-medium text-primary hover:underline" href="/setup">
              {t("auth.login.setupLink")}
            </Link>
          </>
        ) : (
          <Link className="font-medium text-primary hover:underline" href="/register">
            {t("landing.nav.startTrial")}
          </Link>
        )}
      </p>
    </>
  );
}
