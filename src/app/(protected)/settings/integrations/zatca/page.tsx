"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { classifyZatcaFailure, type ZatcaFailureInfo } from "@/lib/integrations/zatca/error-messages";

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
  address?: string;
};

type SellerAddressForm = {
  street: string;
  building: string;
  district: string;
  city: string;
  postalCode: string;
  sellerNameAr: string;
  businessCategory: string;
  invoiceType: string;
};

const EMPTY_SELLER_ADDRESS: SellerAddressForm = {
  street: "", building: "", district: "", city: "", postalCode: "",
  sellerNameAr: "", businessCategory: "", invoiceType: "1100",
};

type ArtifactRow = {
  id: string;
  invoiceId: string;
  uuid: string;
  invoiceNumber?: string;
  customerName?: string;
  status: "pending" | "submitted" | "accepted" | "warning" | "rejected";
  documentType?: "standard" | "simplified";
  environment?: "sandbox" | "production";
  operation?: "clearance" | "reporting";
  technicalStatus?: string;
  lastResponse?: Record<string, unknown> | null;
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

const artifactStatusClass = (status: ArtifactRow["status"]) => {
  if (status === "accepted") return "bg-green-100 text-green-700";
  if (status === "warning") return "bg-amber-100 text-amber-700";
  if (status === "rejected") return "bg-red-100 text-red-700";
  return "bg-surface-muted text-muted";
};

const artifactZatcaResult = (artifact: ArtifactRow) => {
  const response = artifact.lastResponse ?? {};
  return String(response.clearanceStatus ?? response.reportingStatus ?? artifact.technicalStatus ?? "—");
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
  const [failureInfo, setFailureInfo] = useState<ZatcaFailureInfo | null>(null);
  const [complianceFailures, setComplianceFailures] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: Record<string, unknown> } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [renewOtp, setRenewOtp] = useState("");
  const [renewing, setRenewing] = useState(false);
  const [renewResult, setRenewResult] = useState<string | null>(null);
  const [renewFailure, setRenewFailure] = useState<ZatcaFailureInfo | null>(null);
  const [sellerAddress, setSellerAddress] = useState<SellerAddressForm>(EMPTY_SELLER_ADDRESS);
  const [savingSellerAddress, setSavingSellerAddress] = useState(false);
  const [sellerAddressError, setSellerAddressError] = useState<string | null>(null);
  const [sellerAddressSaved, setSellerAddressSaved] = useState(false);
  const [logStatus, setLogStatus] = useState("");
  const [logType, setLogType] = useState("");
  const [logEnvironment, setLogEnvironment] = useState("");
  const [logOperation, setLogOperation] = useState("");
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactRow | null>(null);
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

  useEffect(() => {
    if (!integration) return;
    const config = integration.config ?? {};
    const rawAddress = config.sellerAddress && typeof config.sellerAddress === "object" && !Array.isArray(config.sellerAddress)
      ? config.sellerAddress as Record<string, unknown>
      : {};
    const value = (input: unknown) => typeof input === "string" ? input : "";
    setSellerAddress({
      street: value(rawAddress.street) || company?.address || "",
      building: value(rawAddress.building),
      district: value(rawAddress.district),
      city: value(rawAddress.city),
      postalCode: value(rawAddress.postalCode),
      sellerNameAr: value(config.sellerNameAr),
      businessCategory: value(config.businessCategory),
      invoiceType: value(config.invoiceType) || "1100",
    });
  }, [integration, company?.address]);

  const onboardingStatus =
    typeof integration?.config?.onboardingStatus === "string"
      ? (integration.config.onboardingStatus as string)
      : "";

  const callOnboardingAction = useCallback(
    async (action: "compliance-csid" | "verify-compliance" | "production-csid" | "renew-certificate", body: Record<string, unknown> = {}) => {
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
      setFailureInfo(null);
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
            setFailureInfo({ bucket: "compliance_failed", messageKey: "integrations.zatca.errors.complianceFailed" });
          } else {
            setFailureInfo(classifyZatcaFailure(err));
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
      setFailureInfo(null);
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

  const loadArtifacts = useCallback(async () => {
    if (!integration || !showLogs) return;
    const params = new URLSearchParams();
    if (logFrom) params.set("from", logFrom);
    if (logTo) params.set("to", logTo);
    if (logStatus) params.set("status", logStatus);
    if (logType) params.set("documentType", logType);
    if (logEnvironment) params.set("environment", logEnvironment);
    if (logOperation) params.set("operation", logOperation);
    const suffix = params.size ? `?${params.toString()}` : "";
    const res = await fetch(`/api/integrations/${integration.id}/artifacts${suffix}`);
    const json = await res.json().catch(() => ({}));
    setArtifacts(res.ok ? json.artifacts ?? [] : []);
  }, [integration, showLogs, logFrom, logTo, logStatus, logType, logEnvironment, logOperation]);

  useEffect(() => {
    loadArtifacts();
  }, [loadArtifacts]);

  const handleToggleLogs = () => {
    setShowLogs((current) => !current);
    setSelectedArtifact(null);
  };

  const handleRenew = async () => {
    if (!integration || renewOtp.trim().length < 4) return;
    setRenewing(true); setRenewResult(null); setRenewFailure(null);
    try {
      await callOnboardingAction("renew-certificate", { otp: renewOtp.trim() });
      setRenewOtp(""); setRenewResult("Certificate renewed successfully."); await load();
    } catch (error) { setRenewFailure(classifyZatcaFailure(error)); }
    finally { setRenewing(false); }
  };

  const handleSaveSellerAddress = async () => {
    if (!integration) return;
    setSellerAddressError(null); setSellerAddressSaved(false);
    const required = [sellerAddress.street, sellerAddress.building, sellerAddress.district, sellerAddress.city, sellerAddress.postalCode];
    if (required.some((value) => !value.trim())) {
      setSellerAddressError(t("integrations.zatca.sellerAddress.required"));
      return;
    }
    if (!/^\d+$/.test(sellerAddress.building.trim())) {
      setSellerAddressError(t("integrations.zatca.sellerAddress.buildingInvalid"));
      return;
    }
    if (!/^\d{5}$/.test(sellerAddress.postalCode.trim())) {
      setSellerAddressError(t("integrations.zatca.sellerAddress.postalCodeInvalid"));
      return;
    }
    setSavingSellerAddress(true);
    try {
      const response = await fetch(`/api/integrations/${integration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: {
          sellerAddress: {
            street: sellerAddress.street.trim(), building: sellerAddress.building.trim(),
            district: sellerAddress.district.trim(), city: sellerAddress.city.trim(),
            postalCode: sellerAddress.postalCode.trim(), countryCode: "SA",
          },
          sellerNameAr: sellerAddress.sellerNameAr.trim(),
          businessCategory: sellerAddress.businessCategory.trim(),
          invoiceType: sellerAddress.invoiceType.trim() || "1100",
        } }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      setSellerAddressSaved(true);
      await load();
    } catch {
      setSellerAddressError(t("integrations.zatca.sellerAddress.saveFailed"));
    } finally {
      setSavingSellerAddress(false);
    }
  };

  const failureDetails = (info: ZatcaFailureInfo | null) => info ? (
    <div className="space-y-1">
      <p className="text-sm">{t(info.messageKey)}</p>
      {info.fields?.length ? <p className="text-xs text-muted">{info.fields.map((field) => t(`integrations.zatca.field.${field}`)).join(", ")}</p> : null}
    </div>
  ) : null;

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

      {integration && onboardingStatus !== "production_ready" ? (
        <div className="app-card p-6 card-modern space-y-4">
          <div><h2 className="text-sm font-semibold">{t("integrations.zatca.sellerAddress.title")}</h2><p className="mt-1 text-xs text-muted">{t("integrations.zatca.sellerAddress.description")}</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            {(["street", "building", "district", "city", "postalCode"] as const).map((field) => (
              <label key={field} className="grid gap-1 text-xs text-muted">
                <span>{t(`integrations.zatca.field.${field}`)}</span>
                <input value={sellerAddress[field]} inputMode={field === "building" || field === "postalCode" ? "numeric" : undefined} onChange={(event) => setSellerAddress((current) => ({ ...current, [field]: event.target.value }))} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground" />
              </label>
            ))}
            <label className="grid gap-1 text-xs text-muted"><span>{t("integrations.zatca.sellerAddress.sellerNameAr")}</span><input value={sellerAddress.sellerNameAr} onChange={(event) => setSellerAddress((current) => ({ ...current, sellerNameAr: event.target.value }))} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground" dir="rtl" /></label>
            <label className="grid gap-1 text-xs text-muted"><span>{t("integrations.zatca.sellerAddress.businessCategory")}</span><input value={sellerAddress.businessCategory} onChange={(event) => setSellerAddress((current) => ({ ...current, businessCategory: event.target.value }))} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground" /></label>
            <label className="grid gap-1 text-xs text-muted"><span>{t("integrations.zatca.sellerAddress.invoiceType")}</span><input value={sellerAddress.invoiceType} onChange={(event) => setSellerAddress((current) => ({ ...current, invoiceType: event.target.value }))} className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-foreground" /></label>
          </div>
          {sellerAddressError ? <p className="text-xs text-red-500">{sellerAddressError}</p> : null}
          {sellerAddressSaved ? <p className="text-xs text-green-600">{t("integrations.zatca.sellerAddress.saved")}</p> : null}
          <button type="button" onClick={handleSaveSellerAddress} disabled={savingSellerAddress} className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold disabled:opacity-50">{savingSellerAddress ? `${t("integrations.zatca.sellerAddress.save")}…` : t("integrations.zatca.sellerAddress.save")}</button>
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
              {failureInfo ? failureDetails(failureInfo) : <p className="text-sm">{t("integrations.zatca.errors.generic")}</p>}
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

          {onboardingStatus === "production_ready" ? (
            <div className="rounded-2xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-semibold">Renew certificate</h3>
              <p className="text-xs text-muted">Existing credentials remain active unless renewal succeeds.</p>
              <div className="flex flex-wrap gap-2">
                <input value={renewOtp} onChange={(event) => setRenewOtp(event.target.value)} inputMode="numeric" className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm" placeholder="OTP" />
                <button type="button" onClick={handleRenew} disabled={renewing || renewOtp.trim().length < 4} className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast disabled:opacity-50">{renewing ? "Renewing…" : "Renew certificate"}</button>
              </div>
              {renewResult ? <p className="text-xs text-green-600">{renewResult}</p> : null}
              {renewFailure ? failureDetails(renewFailure) : null}
            </div>
          ) : null}

          {showLogs ? (
            <div className="rounded-2xl border border-border p-3 text-xs">
              <div className="mb-3 grid gap-2 md:grid-cols-3">
                <label className="grid gap-1"><span className="text-muted">{t("integrations.zatca.logs.from")}</span><input type="date" value={logFrom} onChange={(e) => setLogFrom(e.target.value)} className="rounded-xl border border-border bg-surface p-2" /></label>
                <label className="grid gap-1"><span className="text-muted">{t("integrations.zatca.logs.to")}</span><input type="date" value={logTo} onChange={(e) => setLogTo(e.target.value)} className="rounded-xl border border-border bg-surface p-2" /></label>
                <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)} className="rounded-xl border border-border bg-surface p-2"><option value="">All statuses</option><option value="accepted">Accepted</option><option value="warning">Warning</option><option value="rejected">Rejected</option></select>
                <select value={logType} onChange={(e) => setLogType(e.target.value)} className="rounded-xl border border-border bg-surface p-2"><option value="">All types</option><option value="standard">Standard (B2B)</option><option value="simplified">Simplified (B2C)</option></select>
                <select value={logEnvironment} onChange={(e) => setLogEnvironment(e.target.value)} className="rounded-xl border border-border bg-surface p-2"><option value="">All environments</option><option value="sandbox">Sandbox</option><option value="production">Production</option></select>
                <select value={logOperation} onChange={(e) => setLogOperation(e.target.value)} className="rounded-xl border border-border bg-surface p-2"><option value="">All operations</option><option value="clearance">Clearance</option><option value="reporting">Reporting</option></select>
              </div>
              {artifacts.length === 0 ? (
                <p className="text-muted">{t("integrations.zatca.wizard.step4.noArtifacts")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full table-modern">
                    <thead className="bg-surface-muted text-muted">
                      <tr>{(["date", "invoice", "uuid", "customer", "type", "environment", "operation", "status", "result"] as const).map((column) => <th key={column} className={`px-3 py-2 font-semibold ${alignClass}`}>{t(`integrations.zatca.logs.columns.${column}`)}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {artifacts.map((artifact) => (
                        <tr key={artifact.id} tabIndex={0} role="button" onClick={() => setSelectedArtifact(artifact)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedArtifact(artifact); }} className="cursor-pointer transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none">
                          <td className="whitespace-nowrap px-3 py-2">{new Date(artifact.lastSubmittedAt ?? artifact.createdAt).toLocaleDateString(locale)}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-semibold">{artifact.invoiceNumber || "—"}</td>
                          <td className="max-w-52 truncate px-3 py-2 font-mono" title={artifact.uuid}>{artifact.uuid}</td>
                          <td className="px-3 py-2">{artifact.customerName || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2">{artifact.documentType === "simplified" ? t("integrations.zatca.logs.types.simplified") : t("integrations.zatca.logs.types.standard")}</td>
                          <td className="px-3 py-2">{artifact.environment || "—"}</td>
                          <td className="px-3 py-2">{artifact.operation || "—"}</td>
                          <td className="px-3 py-2"><span className={`inline-flex rounded-full px-2 py-1 font-semibold ${artifactStatusClass(artifact.status)}`}>{artifact.status}</span></td>
                          <td className="px-3 py-2">{artifactZatcaResult(artifact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {selectedArtifact ? (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedArtifact(null)}>
                  <aside className="h-full w-full max-w-2xl overflow-y-auto bg-surface p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                    <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{t("integrations.zatca.logs.detail")}</h3><button type="button" onClick={() => setSelectedArtifact(null)} className="rounded-xl border border-border px-3 py-1">{t("common.close")}</button></div>
                    <pre className="overflow-auto whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-4 font-mono text-xs">{JSON.stringify(selectedArtifact.lastResponse ?? {}, null, 2)}</pre>
                  </aside>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
