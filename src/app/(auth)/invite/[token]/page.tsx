"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { PASSWORD_REQUIREMENTS, getPasswordIssues } from "@/lib/security/password-policy";

type InviteInfo = {
  email: string;
  role: string;
};

export default function InviteAcceptPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const passwordIssues = useMemo(() => getPasswordIssues(password), [password]);
  const passwordInvalid = password.length > 0 && passwordIssues.length > 0;

  useEffect(() => {
    fetch(`/api/invites/${params.token}`)
      .then((res) => res.json())
      .then((data) => setInvite(data))
      .catch(() => setErrorKey("error.inviteInvalid"));
  }, [params.token]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    if (passwordInvalid) {
      setErrorKey("auth.password.error.weak");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          name,
          password,
        }),
      });

      if (!response.ok) {
        setErrorKey("error.inviteAcceptFailed");
        return;
      }

      router.replace("/login");
    });
  };

  return (
    <div className="app-card p-6">
      <div className={`mb-6 ${alignClass}`}>
        <p className="text-xs text-muted">{t("auth.invite.subtitle")}</p>
        <h1 className="text-2xl font-semibold">{t("auth.invite.title")}</h1>
      </div>
      {invite ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="app-panel p-3 text-xs text-muted">
            <p>
              {t("auth.invite.description", {
                role: t(`role.${invite.role}`),
                email: invite.email,
              })}
            </p>
          </div>
          <label className="block text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("common.fullName")}
            </span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("common.password")}
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
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
                return (
                  <li key={rule.key} className={passes ? "text-emerald-600" : "text-muted"}>
                    {t(
                      rule.key,
                      rule.values
                        ? Object.fromEntries(
                            Object.entries(rule.values).map(([k, v]) => [k, String(v)]),
                          )
                        : undefined,
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {errorKey ? (
            <p className="text-xs text-red-500">{t(errorKey)}</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("auth.invite.accept")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">
          {errorKey ? t(errorKey) : t("common.loadingInvite")}
        </p>
      )}
    </div>
  );
}
