"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";
import { useToast } from "@/components/toast";
import { SkeletonBlock } from "@/components/skeleton";

type ApprovalConfig = {
  billApprovalThreshold: number;
  payrollApprovalThreshold: number;
};

const EMPTY_CONFIG: ApprovalConfig = {
  billApprovalThreshold: 0,
  payrollApprovalThreshold: 0,
};

export default function ApprovalsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [config, setConfig] = useState<ApprovalConfig>(EMPTY_CONFIG);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify(config), [config]);

  const loadConfig = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    markClean();
    setIsLoading(true);
    fetch(`/api/companies/${activeCompanyId}/config`)
      .then((res) => res.json())
      .then((data) => {
        const cfg = data?.config ?? {};
        const nextConfig = {
          billApprovalThreshold:
            typeof cfg.billApprovalThreshold === "number"
              ? cfg.billApprovalThreshold
              : EMPTY_CONFIG.billApprovalThreshold,
          payrollApprovalThreshold:
            typeof cfg.payrollApprovalThreshold === "number"
              ? cfg.payrollApprovalThreshold
              : EMPTY_CONFIG.payrollApprovalThreshold,
        };
        setConfig(nextConfig);
        setInitialSnapshot(JSON.stringify(nextConfig));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setInitialSnapshot(JSON.stringify(config));
      markClean();
      toast(t("common.saved"), "success");
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("approvals.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("approvals.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("approvals.billThreshold")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <input
                type="number"
                min={0}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.billApprovalThreshold}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    billApprovalThreshold: Number(event.target.value),
                  }))
                }
              />
            )}
            <p className="mt-1 text-xs text-muted">{t("approvals.billHint")}</p>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">
              {t("approvals.payrollThreshold")}
            </span>
            {isLoading ? (
              <SkeletonBlock className="h-9 w-full" />
            ) : (
              <input
                type="number"
                min={0}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={config.payrollApprovalThreshold}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    payrollApprovalThreshold: Number(event.target.value),
                  }))
                }
              />
            )}
            <p className="mt-1 text-xs text-muted">{t("approvals.payrollHint")}</p>
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="button"
          className="mt-4 w-fit rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          onClick={handleSave}
          disabled={isPending}
        >
          {t("common.save")}
        </button>
      </div>
    </section>
  );
}
