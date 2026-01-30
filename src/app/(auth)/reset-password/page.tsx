"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { PASSWORD_REQUIREMENTS, getPasswordIssues } from "@/lib/security/password-policy";

export default function ResetPasswordPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();
  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const passwordInvalid = password.length > 0 && passwordIssues.length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    if (!token) {
      setErrorKey("auth.reset.invalid");
      return;
    }
    if (passwordInvalid) {
      setErrorKey("auth.password.error.weak");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        setErrorKey("auth.reset.failed");
        return;
      }
      setSuccess(true);
      setTimeout(() => router.replace("/login"), 800);
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 py-6 lg:py-8">
      <div className={`mb-6 ${alignClass}`}>
        <p className="text-xs text-muted">{t("app.name")}</p>
        <h1 className="text-2xl font-semibold">{t("auth.reset.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("auth.reset.subtitle")}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm">
          <span className={`mb-1 block text-xs font-medium text-muted ${alignClass}`}>
            {t("common.password")}
          </span>
          <input
            type="password"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
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
        {success ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t("auth.reset.success")}
          </div>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {isPending ? t("common.loading") : t("auth.reset.submit")}
        </button>
      </form>
    </div>
  );
}
