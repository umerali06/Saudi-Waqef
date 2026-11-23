"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "@/i18n/provider";
import { PASSWORD_REQUIREMENTS, getPasswordIssues } from "@/lib/security/password-policy";

const INPUT_CLASS =
  "w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15";

const mapError = (error?: string) => {
  switch (error) {
    case "Wrong password":
      return "security.password.error.wrong";
    case "Weak password":
      return "auth.password.error.weak";
    case "Same password":
      return "security.password.error.same";
    case "Too many attempts":
      return "security.password.error.locked";
    default:
      return "error.saveFailed";
  }
};

export function ChangePasswordForm() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const issues = useMemo(() => getPasswordIssues(newPassword), [newPassword]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    setSaved(false);
    if (issues.length > 0) {
      setErrorKey("auth.password.error.weak");
      return;
    }
    if (newPassword !== confirmation) {
      setErrorKey("security.password.error.mismatch");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/security/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setErrorKey(mapError(data?.error));
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="app-card space-y-4 p-4 card-modern">
      <div className={alignClass}>
        <h2 className="text-lg font-semibold">{t("security.password.title")}</h2>
        <p className="text-xs text-muted">{t("security.password.description")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block text-sm">
          <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
            {t("security.password.current")}
          </span>
          <input
            type="password"
            autoComplete="current-password"
            className={INPUT_CLASS}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
            {t("security.password.new")}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASS}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
            {t("security.password.confirm")}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            className={INPUT_CLASS}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
      </div>
      <ul className={`grid gap-1 text-xs md:grid-cols-2 ${alignClass}`}>
        {PASSWORD_REQUIREMENTS.map((rule) => (
          <li
            key={rule.key}
            className={rule.test(newPassword) ? "text-emerald-600" : "text-muted"}
          >
            {t(
              rule.key,
              rule.values
                ? Object.fromEntries(
                    Object.entries(rule.values).map(([key, value]) => [key, String(value)])
                  )
                : undefined
            )}
          </li>
        ))}
      </ul>
      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t("security.password.saved")}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:opacity-60"
      >
        {t("security.password.submit")}
      </button>
    </form>
  );
}
