"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useToast } from "@/components/toast";

type MfaStatus = {
  mfaEnabled: boolean;
  mfaPending: boolean;
  issuer: string;
};

export default function SecuritySettingsPage() {
  const { t, locale } = useTranslations();
  const { activeCompanyId, activeCompany } = useCompany();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const isAdmin = ["owner", "admin"].includes(activeCompany?.role ?? "");

  const loadStatus = useCallback(() => {
    if (!activeCompanyId || !isAdmin) {
      return;
    }
    setIsLoading(true);
    fetch(`/api/security/mfa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        setStatus({
          mfaEnabled: Boolean(data.mfaEnabled),
          mfaPending: Boolean(data.mfaPending),
          issuer: data.issuer ?? "",
        });
      })
      .catch(() => setStatus(null))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, isAdmin]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleEnroll = () => {
    if (!activeCompanyId) return;
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch("/api/security/mfa/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });
      if (!response.ok) {
        setErrorKey("security.mfa.error.enroll");
        return;
      }
      const data = await response.json();
      setSecret(data.secret);
      setOtpauth(data.otpauth);
      loadStatus();
    });
  };

  const handleVerify = () => {
    if (!activeCompanyId) return;
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch("/api/security/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, code: verifyCode }),
      });
      if (!response.ok) {
        setErrorKey("security.mfa.error.verify");
        return;
      }
      setNoticeKey("security.mfa.enabled");
      setSecret(null);
      setOtpauth(null);
      setVerifyCode("");
      loadStatus();
      toast(t("common.saved"), "success");
    });
  };

  const handleDisable = () => {
    if (!activeCompanyId) return;
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch("/api/security/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, code: disableCode }),
      });
      if (!response.ok) {
        setErrorKey("security.mfa.error.disable");
        return;
      }
      setNoticeKey("security.mfa.disabled");
      setDisableCode("");
      loadStatus();
      toast(t("common.saved"), "success");
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.security.title")}</h1>
        <p className="text-sm text-muted">{t("settings.security.subtitle")}</p>
      </div>

      {!isAdmin ? (
        <div className="app-card p-4 text-sm text-muted">
          {t("settings.security.restricted")}
        </div>
      ) : (
        <div className="app-card space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={alignClass}>
              <h2 className="text-lg font-semibold">{t("security.mfa.title")}</h2>
              <p className="text-xs text-muted">{t("security.mfa.description")}</p>
            </div>
            {isLoading ? (
              <SkeletonBlock className="h-6 w-20 rounded-full" />
            ) : (
              <div className="rounded-full bg-surface-muted px-3 py-1 text-xs">
                {status?.mfaEnabled
                  ? t("security.mfa.status.enabled")
                  : t("security.mfa.status.disabled")}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-4 w-64" />
              <SkeletonBlock className="h-9 w-32" />
            </div>
          ) : status?.mfaEnabled ? (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                  {t("security.mfa.codeLabel")}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                  value={disableCode}
                  onChange={(event) => setDisableCode(event.target.value)}
                  placeholder={t("security.mfa.codePlaceholder")}
                />
              </label>
              <button
                type="button"
                onClick={handleDisable}
                disabled={isPending}
                className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition hover:bg-surface-muted"
              >
                {t("security.mfa.disable")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted">{t("security.mfa.instructions")}</p>
              <button
                type="button"
                onClick={handleEnroll}
                disabled={isPending}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              >
                {t("security.mfa.enable")}
              </button>
              {status?.mfaPending && !secret ? (
                <p className="text-xs text-muted">{t("security.mfa.pending")}</p>
              ) : null}

              {secret ? (
                <div className="space-y-3 rounded-xl border border-border bg-surface-muted p-3 text-sm">
                  <div className="text-xs text-muted">{t("security.mfa.secretLabel")}</div>
                  <div className="break-all font-mono text-xs">{secret}</div>
                  {otpauth ? (
                    <div className="text-xs text-muted">
                      {t("security.mfa.otpauthLabel")}
                      <div className="break-all font-mono text-[10px]">{otpauth}</div>
                    </div>
                  ) : null}
                  <label className="block text-sm">
                    <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                      {t("security.mfa.codeLabel")}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                      value={verifyCode}
                      onChange={(event) => setVerifyCode(event.target.value)}
                      placeholder={t("security.mfa.codePlaceholder")}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleVerify}
                    disabled={isPending}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                  >
                    {t("security.mfa.verify")}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {errorKey ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
          {noticeKey ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {t(noticeKey)}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
