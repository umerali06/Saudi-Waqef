"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useToast } from "@/components/toast";

const NOTIFICATION_TYPES = [
  "invoice_sent",
  "invoice_overdue",
  "invoice_paid",
  "customer_statement_sent",
  "vendor_statement_sent",
  "bill_due",
  "bill_paid",
  "payroll_approved",
  "payslip_available",
  "leave_approved",
  "leave_rejected",
  "subscription_payment_success",
  "subscription_payment_failed",
] as const;

type ChannelPrefs = {
  email: boolean;
  inApp: boolean;
  sms: boolean;
};

type Preferences = {
  userId: string;
  companyId: string;
  channels: ChannelPrefs;
  types: Record<string, Partial<ChannelPrefs>>;
};

export default function NotificationSettingsPage() {
  const { data: session } = useSession();
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [templateType, setTemplateType] = useState<(typeof NOTIFICATION_TYPES)[number]>(
    NOTIFICATION_TYPES[0]
  );
  const [templateLocale, setTemplateLocale] = useState<"ar" | "en">("ar");
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    mode: string;
    fromAddress?: string | null;
  } | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    setIsLoading(true);
    fetch(`/api/notification-preferences?companyId=${activeCompanyId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setPrefs(data.preferences))
      .catch(() => setError(t("notifications.errors.loadFailed")))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, t]);

  useEffect(() => {
    fetch("/api/email/status")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setEmailStatus(data))
      .catch(() => setEmailStatus(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("type", templateType);
    params.set("locale", templateLocale);
    fetch(`/api/notifications/preview?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setPreview(data.rendered))
      .catch(() => setPreview(null));
  }, [templateType, templateLocale]);

  const types = useMemo(
    () => NOTIFICATION_TYPES.map((type) => ({
      key: type,
      label: t(`notifications.type.${type}`),
    })),
    [t]
  );

  const toggleChannel = (field: keyof ChannelPrefs) => {
    if (!prefs) return;
    setPrefs({
      ...prefs,
      channels: { ...prefs.channels, [field]: !prefs.channels[field] },
    });
  };

  const toggleTypeChannel = (type: string, field: keyof ChannelPrefs) => {
    if (!prefs) return;
    const existing = prefs.types[type] ?? {};
    const current = (existing as ChannelPrefs)[field] ?? prefs.channels[field];
    setPrefs({
      ...prefs,
      types: {
        ...prefs.types,
        [type]: { ...existing, [field]: !current },
      },
    });
  };

  const handleSave = () => {
    if (!prefs || !activeCompanyId) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          channels: prefs.channels,
          types: prefs.types,
        }),
      });
      if (!response.ok) {
        setError(t("notifications.errors.updateFailed"));
        return;
      }
      toast(t("notifications.saved"), "success");
    });
  };

  const handleTest = () => {
    if (!activeCompanyId || !session?.user?.email) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          email: session.user.email,
          type: templateType,
          locale: templateLocale,
        }),
      });
      if (!response.ok) {
        setError(t("notifications.errors.testFailed"));
        return;
      }
      toast(t("notifications.testSent"), "success");
    });
  };

  const handleDispatch = async () => {
    if (!activeCompanyId) return;
    setMessage(null);
    setError(null);
    setDispatching(true);
    const response = await fetch("/api/email/dispatch-now", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, retryFailed: true }),
    });
    setDispatching(false);
    if (!response.ok) {
      setError(t("notifications.emailDelivery.dispatchFailed"));
      return;
    }
    toast(t("notifications.emailDelivery.dispatchSuccess"), "success");
  };

  const handleVerify = async () => {
    if (!activeCompanyId) return;
    setMessage(null);
    setError(null);
    setVerifying(true);
    const response = await fetch("/api/email/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, to: session?.user?.email ?? undefined }),
    });
    setVerifying(false);
    if (!response.ok) {
      setError(t("notifications.emailDelivery.verifyFailed"));
      return;
    }
    toast(t("notifications.emailDelivery.verifySuccess"), "success");
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("notifications.settings.title")}</h1>
        <p className="text-sm text-muted">{t("notifications.settings.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className={`app-card p-4 ${alignClass}`}>
        <h2 className="text-sm font-semibold">{t("notifications.settings.defaultChannels")}</h2>
        {isLoading ? (
          <div className="mt-3 flex gap-4">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-24" />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs?.channels.email ?? false}
                onChange={() => toggleChannel("email")}
              />
              {t("notifications.channel.email")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs?.channels.inApp ?? false}
                onChange={() => toggleChannel("inApp")}
              />
              {t("notifications.channel.inApp")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs?.channels.sms ?? false}
                onChange={() => toggleChannel("sms")}
              />
              {t("notifications.channel.sms")}
            </label>
          </div>
        )}
      </div>

      <div className={`app-card p-4 ${alignClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">{t("notifications.emailDelivery.title")}</h2>
            <p className="mt-1 text-xs text-muted">
              {t("notifications.emailDelivery.subtitle")}
            </p>
          </div>
          {emailStatus?.configured ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
              {t("notifications.emailDelivery.configured")}
            </span>
          ) : (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
              {t("notifications.emailDelivery.notConfigured")}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
            <p className="text-xs text-muted">{t("notifications.emailDelivery.mode")}</p>
            <p className="font-semibold">
              {emailStatus?.mode === "immediate"
                ? t("notifications.emailDelivery.modeImmediate")
                : t("notifications.emailDelivery.modeQueue")}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
            <p className="text-xs text-muted">{t("notifications.emailDelivery.fromAddress")}</p>
            <p className="font-semibold">{emailStatus?.fromAddress ?? "--"}</p>
          </div>
        </div>

        {!emailStatus?.configured ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t("notifications.emailDelivery.missingConfig")}
          </div>
        ) : null}

        {emailStatus?.mode !== "immediate" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              onClick={handleDispatch}
              disabled={dispatching}
            >
              {dispatching
                ? t("notifications.emailDelivery.dispatching")
                : t("notifications.emailDelivery.dispatchNow")}
            </button>
            <p className="text-xs text-muted">
              {t("notifications.emailDelivery.queueHint")}
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold"
            onClick={handleVerify}
            disabled={verifying}
          >
            {verifying
              ? t("notifications.emailDelivery.verifying")
              : t("notifications.emailDelivery.verify")}
          </button>
          <p className="text-xs text-muted">
            {t("notifications.emailDelivery.verifyHint")}
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-muted">
          <p className="font-semibold">{t("notifications.emailDelivery.gmailTitle")}</p>
          <p className="mt-1">{t("notifications.emailDelivery.gmailHint")}</p>
          <p className="mt-1">
            <span className="font-semibold">{t("notifications.emailDelivery.gmailHost")}</span>{" "}
            smtp.gmail.com
          </p>
          <p className="mt-1">
            <span className="font-semibold">{t("notifications.emailDelivery.gmailPortTls")}</span>{" "}
            465
          </p>
          <p className="mt-1">
            <span className="font-semibold">{t("notifications.emailDelivery.gmailPortStartTls")}</span>{" "}
            587
          </p>
          <p className="mt-1">{t("notifications.emailDelivery.gmailAppPassword")}</p>
        </div>
      </div>

      <div className="app-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("notifications.settings.byType")}
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <SkeletonBlock className="h-5 w-48" />
                <div className="flex gap-4">
                  <SkeletonBlock className="h-4 w-16" />
                  <SkeletonBlock className="h-4 w-16" />
                  <SkeletonBlock className="h-4 w-16" />
                </div>
              </div>
            ))
          ) : (
            types.map((item) => (
              <div key={item.key} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="font-semibold">{item.label}</p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={prefs?.types[item.key]?.email ?? prefs?.channels.email ?? false}
                        onChange={() => toggleTypeChannel(item.key, "email")}
                      />
                      {t("notifications.channel.email")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={prefs?.types[item.key]?.inApp ?? prefs?.channels.inApp ?? false}
                        onChange={() => toggleTypeChannel(item.key, "inApp")}
                      />
                      {t("notifications.channel.inApp")}
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={prefs?.types[item.key]?.sms ?? prefs?.channels.sms ?? false}
                        onChange={() => toggleTypeChannel(item.key, "sms")}
                      />
                      {t("notifications.channel.sms")}
                    </label>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {t("notifications.save")}
          </button>
        </div>
      </div>

      <div className={`app-card p-4 ${alignClass}`}>
        <h2 className="text-sm font-semibold">{t("notifications.preview.title")}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("notifications.preview.type")}</span>
            <select
              value={templateType}
              onChange={(event) => setTemplateType(event.target.value as typeof NOTIFICATION_TYPES[number])}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              {types.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("notifications.preview.locale")}</span>
            <select
              value={templateLocale}
              onChange={(event) => setTemplateLocale(event.target.value as "ar" | "en")}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="ar">{t("language.ar")}</option>
              <option value="en">{t("language.en")}</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="cursor-pointer rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              onClick={handleTest}
            >
              {t("notifications.preview.testSend")}
            </button>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-border bg-surface-muted p-3 text-sm">
          <p className="text-xs text-muted">{t("notifications.preview.subject")}</p>
          <p className="font-semibold">{preview?.subject ?? "--"}</p>
          <p className="mt-2 text-xs text-muted">{t("notifications.preview.body")}</p>
          <p>{preview?.body ?? "--"}</p>
        </div>
      </div>
    </section>
  );
}
