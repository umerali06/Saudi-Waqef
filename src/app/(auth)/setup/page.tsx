"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { PASSWORD_REQUIREMENTS, getPasswordIssues } from "@/lib/security/password-policy";

export default function SetupPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [companyName, setCompanyName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const passwordInvalid = password.length > 0 && passwordIssues.length > 0;

  useEffect(() => {
    fetch("/api/setup/status")
      .then((res) => res.json())
      .then((data) => {
        if (data.hasUsers) {
          router.replace("/login");
        }
      })
      .catch(() => null)
      .finally(() => setCheckingSetup(false));
  }, [router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    if (passwordInvalid) {
      setErrorKey("auth.password.error.weak");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/setup/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          adminName,
          email,
          password,
        }),
      });

      if (!response.ok) {
        setErrorKey("error.setupFailed");
        return;
      }

      router.replace("/login");
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 py-6 lg:py-8">
      <div className={`mb-6 ${alignClass}`}>
        <p className="text-xs text-muted">{t("auth.setup.subtitle")}</p>
        <h1 className="text-2xl font-semibold">{t("auth.setup.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.setup.description")}</p>
      </div>
      {checkingSetup ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded-full bg-surface-muted" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-surface-muted" />
            </div>
          ))}
          <div className="h-20 w-full animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-10 w-full animate-pulse rounded-xl bg-surface-muted" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.companyName")}
          </span>
          <input
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.adminName")}
          </span>
          <input
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            value={adminName}
            onChange={(event) => setAdminName(event.target.value)}
            required
          />
        </label>
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
              {showPassword ? t("auth.setup.hidePassword") : t("auth.setup.showPassword")}
            </button>
          </div>
        </label>
        <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-muted">
          <p className={`mb-2 text-[11px] ${alignClass}`}>
            {t("auth.password.rulesTitle")}
          </p>
          <ul className={`space-y-1 ${alignClass}`}>
            {PASSWORD_REQUIREMENTS.map((rule) => {
              const passes = rule.test(password);
              const stringValues = rule.values
                ? Object.fromEntries(
                    Object.entries(rule.values).map(([key, value]) => [
                      key,
                      String(value),
                    ])
                  )
                : undefined;
              return (
                <li key={rule.key} className={passes ? "text-emerald-600" : "text-muted"}>
                  {t(rule.key, stringValues)}
                </li>
              );
            })}
          </ul>
        </div>
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
          {isPending ? t("common.loading") : t("auth.setup.submit")}
        </button>
        </form>
      )}
      <div className="mt-auto pt-4">
        <p className="text-xs text-muted">
          {t("auth.setup.backToLogin")}{" "}
          <button
            type="button"
            onClick={() => router.replace("/login")}
            className="font-semibold text-foreground"
          >
            {t("auth.setup.loginLink")}
          </button>
        </p>
      </div>
    </div>
  );
}
