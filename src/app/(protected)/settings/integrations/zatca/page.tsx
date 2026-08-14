"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { classifyZatcaFailure } from "@/lib/integrations/zatca/error-messages";

const FATOORA_PORTAL_URL = "https://fatoora.zatca.gov.sa/";

type Integration = {
  id: string;
  companyId: string;
  name: string;
  connector: "zatca" | "gosi" | "mudad" | "custom";
  status: "inactive" | "active" | "error";
  environment: "sandbox" | "production";
  config?: Record<string, unknown>;
  lastError?: string | null;
};

type CompanyDetail = {
  name: string;
  vatNumber?: string;
  legalName?: string;
};

type ArtifactRow = {
  id: string;
  invoiceId: string;
  uuid: string;
  status: "pending" | "submitted" | "accepted" | "rejected";
  providerReference?: string | null;
  lastSubmittedAt?: string | null;
  createdAt: string;
};

type StepKey = "csid" | "compliance" | "production";
type StepStatus = "pending" | "running" | "done" | "failed";

const INITIAL_PROGRESS: Record<StepKey, StepStatus> = {
  csid: "pending",
  compliance: "pending",
  production: "pending",
};

export default function ZatcaWizardPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const isAdmin = ["owner", "admin"].includes(activeCompany?.role ?? "");

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<StepKey, StepStatus>>(INITIAL_PROGRESS);
  const [running, setRunning] = useState(false);
  const [failedStep, setFailedStep] = useState<StepKey | null>(null);
  const [failureMessageKey, setFailureMessageKey] = useState<string | null>(null);
  const [complianceFailures, setComplianceFailures] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: Record<string, unknown> } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const autoResumedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    const [companyRes, integrationsRes] = await Promise.all([
      fetch(`/api/companies/${activeCompanyId}`).then((res) => res.json()).catch(() => null),
      fetch(`/api/integrations?companyId=${activeCompanyId}`).then((res) => res.json()).catch(() => null),
    ]);
    setCompany(companyRes?.company ?? null);
    const found =
      (integrationsRes?.integrations as Integration[] | undefined)?.find(
        (item) => item.connector === "zatca"
      ) ?? null;
    setIntegration(found);
    setLoading(false);
  }, [activeCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  const onboardingStatus =
    typeof integration?.config?.onboardingStatus === "string"
      ? (integration.config.onboardingStatus as string)
      : "";

  const callOnboardingAction = useCallback(
    async (action: "compliance-csid" | "verify-compliance" | "production-csid", body: Record<string, unknown> = {}) => {
      if (!integration) throw new Error("No ZATCA integration to act on.");
      const res = await fetch(`/api/integrations/${integration.id}/zatca/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw json;
      }
      return json;
    },
    [integration]
  );

  const runStep3 = useCallback(
    async (opts: { otp?: string; resumeFrom?: StepKey }) => {
      if (!integration) return;
      setRunning(true);
      setFailedStep(null);
      setFailureMessageKey(null);
      setComplianceFailures([]);

      const steps: StepKey[] = ["csid", "compliance", "production"];
      const resumeFrom = opts.resumeFrom ?? "csid";
      const startIndex = steps.indexOf(resumeFrom);
      const nextProgress: Record<StepKey, StepStatus> = { ...INITIAL_PROGRESS };
      for (let i = 0; i < startIndex; i += 1) {
        nextProgress[steps[i]] = "done";
      }
      setProgress(nextProgress);

      for (let i = startIndex; i < steps.length; i += 1) {
        const stepKey = steps[i];
        setProgress((prev) => ({ ...prev, [stepKey]: "running" }));
        try {
          if (stepKey === "csid") {
            await callOnboardingAction("compliance-csid", { otp: opts.otp });
          } else if (stepKey === "compliance") {
            await callOnboardingAction("verify-compliance");
          } else {
            await callOnboardingAction("production-csid");
          }
          setProgress((prev) => ({ ...prev, [stepKey]: "done" }));
        } catch (err) {
          setProgress((prev) => ({ ...prev, [stepKey]: "failed" }));
          setFailedStep(stepKey);
          if (stepKey === "compliance" && err && typeof err === "object" && "checks" in (err as Record<string, unknown>)) {
            const checks = (err as { checks?: Array<{ scenarioId: string; gating: boolean; valid: boolean }> }).checks ?? [];
            setComplianceFailures(checks.filter((c) => c.gating && !c.valid).map((c) => c.scenarioId));
            setFailureMessageKey("integrations.zatca.errors.complianceFailed");
          } else {
            setFailureMessageKey(classifyZatcaFailure(err).messageKey);
          }
          setRunning(false);
          await load();
          return;
        }
      }
      setRunning(false);
      await load();
    },
    [integration, callOnboardingAction, load]
  );

  useEffect(() => {
    if (!integration || autoResumedRef.current || running) return;
    if (onboardingStatus === "compliance_csid_issued") {
      autoResumedRef.current = true;
      runStep3({ resumeFrom: "compliance" });
    } else if (onboardingStatus === "compliance_verified") {
      autoResumedRef.current = true;
      runStep3({ resumeFrom: "production" });
    }
  }, [integration, onboardingStatus, running, runStep3]);

  const handleStart = async () => {
    if (!activeCompanyId) return;
    setCreating(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: "ZATCA e-Invoicing",
          connector: "zatca",
          environment: "sandbox",
          status: "inactive",
        }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmOtp = () => {
    const trimmed = otp.trim();
    if (trimmed.length < 4) {
      setOtpError(t("integrations.zatca.wizard.step2.otpLabel"));
      return;
    }
    setOtpError(null);
    setOtp("");
    runStep3({ otp: trimmed, resumeFrom: "csid" });
  };

  const handleRetry = () => {
    if (failedStep === "csid") {
      setFailedStep(null);
      setFailureMessageKey(null);
      setProgress(INITIAL_PROGRESS);
      return;
    }
    if (failedStep) {
      runStep3({ resumeFrom: failedStep });
      return;
    }
    if (onboardingStatus === "compliance_failed") {
      runStep3({ resumeFrom: "compliance" });
    }
  };

  const handleTestConnection = async () => {
    if (!integration) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/test`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setTestResult({ ok: Boolean(json.ok), message: json.message ?? "", details: json.details });
    } catch {
      setTestResult({ ok: false, message: t("integrations.zatca.errors.unavailable") });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleLogs = async () => {
    const next = !showLogs;
    setShowLogs(next);
    if (next && integration && artifacts.length === 0) {
      const res = await fetch(`/api/integrations/${integration.id}/artifacts`);
      const json = await res.json().catch(() => ({}));
      setArtifacts(json.artifacts ?? []);
    }
  };

  if (!isAdmin) {
    return (
      <section className={`app-card p-6 card-modern ${alignClass}`}>
        <p className="text-sm text-muted">{t("integrations.adminOnly")}</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={`app-card p-6 card-modern ${alignClass}`}>
        <p className="text-sm text-muted">...</p>
      </section>
    );
  }

  const isFailedPersisted = onboardingStatus === "compliance_failed";
  let step: 1 | 2 | 3 | 4;
  if (!integration) {
    step = 1;
  } else if (onboardingStatus === "production_ready") {
    step = 4;
  } else if (isFailedPersisted) {
    step = 4;
  } else if (running) {
    step = 3;
  } else if (failedStep) {
    step = 4;
  } else if (onboardingStatus === "compliance_csid_issued" || onboardingStatus === "compliance_verified") {
    step = 3;
  } else {
    step = 2;
  }

  return (
    <section className={`space-y-6 ${alignClass}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t("integrations.zatca.wizard.setupCard.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("integrations.zatca.wizard.setupCard.description")}</p>
        </div>
        <Link href="/settings/integrations" className="text-xs font-semibold text-muted underline">
          {t("integrations.zatca.wizard.backToIntegrations")}
        </Link>
      </div>

      {step === 1 ? (
        <div className="app-card p-6 card-modern space-y-4">
          <h2 className="text-sm font-semibold">{t("integrations.zatca.wizard.step1.title")}</h2>
          <p className="text-xs text-muted">{t("integrations.zatca.wizard.step1.description")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted">{t("integrations.zatca.wizard.step1.vatNumber")}</p>
              <p className="text-sm font-semibold">{company?.vatNumber || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{t("integrations.zatca.wizard.step1.legalName")}</p>
              <p className="text-sm font-semibold">{company?.legalName || company?.name || "-"}</p>
            </div>
          </div>
          {!company?.vatNumber ? (
            <p className="text-xs text-red-500">{t("integrations.zatca.wizard.step1.missingVat")}</p>
          ) : null}
          <button
            type="button"
            disabled={creating || !company?.vatNumber}
            onClick={handleStart}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast disabled:opacity-50"
          >
            {t("integrations.zatca.wizard.step1.start")}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="app-card p-6 card-modern space-y-4">
          <h2 className="text-sm font-semibold">{t("integrations.zatca.wizard.step2.title")}</h2>
          <p className="text-xs text-muted">{t("integrations.zatca.wizard.step2.instructions")}</p>
          <a
            href={FATOORA_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-2xl border border-border px-4 py-2 text-xs font-semibold"
          >
            {t("integrations.zatca.wizard.step2.openPortal")}
          </a>
          <div className="grid gap-2 md:max-w-sm">
            <label className="text-xs text-muted">{t("integrations.zatca.wizard.step2.otpLabel")}</label>
            <input
              className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              placeholder={t("integrations.zatca.wizard.step2.otpPlaceholder")}
              inputMode="numeric"
            />
            {otpError ? <p className="text-xs text-red-500">{otpError}</p> : null}
          </div>
          <button
            type="button"
            onClick={handleConfirmOtp}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast"
          >
            {t("integrations.zatca.wizard.step2.confirm")}
          </button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="app-card p-6 card-modern space-y-4">
          <h2 className="text-sm font-semibold">{t("integrations.zatca.wizard.step3.title")}</h2>
          <ul className="space-y-2 text-sm">
            {(
              [
                ["csid", "integrations.zatca.wizard.step3.generatingCertificate"],
                ["compliance", "integrations.zatca.wizard.step3.runningChecks"],
                ["production", "integrations.zatca.wizard.step3.requestingProduction"],
              ] as Array<[StepKey, string]>
            ).map(([key, labelKey]) => (
              <li key={key} className="flex items-center gap-2">
                <span
                  className={
                    progress[key] === "done"
                      ? "text-green-600"
                      : progress[key] === "failed"
                        ? "text-red-500"
                        : progress[key] === "running"
                          ? "text-amber-500"
                          : "text-muted"
                  }
                >
                  {progress[key] === "done" ? "✓" : progress[key] === "failed" ? "✕" : progress[key] === "running" ? "…" : "○"}
                </span>
                <span>{t(labelKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="app-card p-6 card-modern space-y-4">
          {onboardingStatus === "production_ready" ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              🟢 {t("integrations.zatca.wizard.step4.statusActive")}
            </span>
          ) : isFailedPersisted || failedStep ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
              {t("integrations.zatca.wizard.step4.statusFailed")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              🟡 {t("integrations.zatca.wizard.step4.statusTesting")}
            </span>
          )}

          {isFailedPersisted || failedStep ? (
            <div className="space-y-3">
              <p className="text-sm">
                {failureMessageKey ? t(failureMessageKey) : t("integrations.zatca.errors.generic")}
              </p>
              {complianceFailures.length > 0 ? (
                <p className="text-xs text-muted">{complianceFailures.join(", ")}</p>
              ) : null}
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold"
              >
                {failedStep === "csid" ? t("integrations.zatca.wizard.step4.retryFromOtp") : t("integrations.zatca.wizard.step4.retry")}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={testing}
                onClick={handleTestConnection}
                className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {testing ? t("integrations.zatca.wizard.step4.testConnectionRunning") : t("integrations.zatca.wizard.step4.testConnection")}
              </button>
              <button
                type="button"
                onClick={handleToggleLogs}
                className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold"
              >
                {showLogs ? t("integrations.zatca.wizard.step4.hideLogs") : t("integrations.zatca.wizard.step4.viewLogs")}
              </button>
            </div>
          )}

          {testResult ? (
            <div className="rounded-2xl border border-border bg-surface-muted p-3 text-xs">
              <p className="font-semibold">{testResult.message}</p>
              {testResult.details?.bodyPreview ? (
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap">
                  {String(testResult.details.bodyPreview)}
                </pre>
              ) : null}
            </div>
          ) : null}

          {showLogs ? (
            <div className="rounded-2xl border border-border p-3 text-xs">
              {artifacts.length === 0 ? (
                <p className="text-muted">{t("integrations.zatca.wizard.step4.noArtifacts")}</p>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <div key={artifact.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="font-mono">{artifact.uuid}</span>
                      <span
                        className={
                          artifact.status === "accepted"
                            ? "text-green-600"
                            : artifact.status === "rejected"
                              ? "text-red-500"
                              : "text-muted"
                        }
                      >
                        {artifact.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
