"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type Integration = {
  id: string;
  companyId: string;
  name: string;
  connector: "zatca" | "gosi" | "mudad" | "custom";
  status: "inactive" | "active" | "error";
  environment: "sandbox" | "production";
  config?: Record<string, unknown>;
  credentialsSet: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

type IntegrationLog = {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

type IntegrationJob = {
  id: string;
  type: "sync" | "test";
  status: "queued" | "running" | "failed" | "success";
  attempts: number;
  lastError?: string | null;
  createdAt: string;
};

type IntegrationArtifact = {
  id: string;
  invoiceId: string;
  uuid: string;
  status: "pending" | "submitted" | "accepted" | "rejected";
  providerReference?: string | null;
  lastSubmittedAt?: string | null;
  lastResponse?: Record<string, unknown> | null;
  createdAt: string;
};

type IntegrationWebhookEvent = {
  id: string;
  timestamp: string;
  processedAt?: string | null;
  replayCount: number;
  lastReplayAt?: string | null;
  lastResult?: Record<string, unknown> | null;
  createdAt: string;
};

type LatestSyncSummary = {
  integrationId: string;
  details: Record<string, unknown>;
  capturedAt: string;
};

type FormState = {
  name: string;
  connector: Integration["connector"];
  environment: Integration["environment"];
  status: Integration["status"];
  endpoint: string;
  testEndpoint: string;
  syncEndpoint: string;
  testMethod: string;
  syncMethod: string;
  authType: "bearer" | "api_key" | "basic" | "none";
  apiKeyHeader: string;
  timeoutMs: string;
  retries: string;
  retryBackoffMs: string;
  retryOnStatus: string;
  idempotencyHeader: string;
  callbackUrl: string;
  includeDatasets: string;
  payloadMode: "base" | "fields" | "template";
  incremental: "true" | "false";
  maxInvoicesPerSync: string;
  headersJson: string;
  mappingJson: string;
  payloadTemplateJson: string;
  apiKey: string;
  username: string;
  password: string;
  webhookSecret: string;
  webhookSecretPrevious: string;
  webhookToleranceSec: string;
  certificatePem: string;
  privateKeyPem: string;
};

const CONNECTORS = [
  { key: "zatca", labelKey: "integrations.connector.zatca", descKey: "integrations.connector.zatcaDesc" },
  { key: "gosi", labelKey: "integrations.connector.gosi", descKey: "integrations.connector.gosiDesc" },
  { key: "mudad", labelKey: "integrations.connector.mudad", descKey: "integrations.connector.mudadDesc" },
  { key: "custom", labelKey: "integrations.connector.custom", descKey: "integrations.connector.customDesc" },
];

const EMPTY_FORM: FormState = {
  name: "",
  connector: "zatca",
  environment: "sandbox",
  status: "inactive",
  endpoint: "",
  testEndpoint: "",
  syncEndpoint: "",
  testMethod: "GET",
  syncMethod: "POST",
  authType: "bearer",
  apiKeyHeader: "X-API-Key",
  timeoutMs: "15000",
  retries: "1",
  retryBackoffMs: "1000",
  retryOnStatus: "429,500,502,503,504",
  idempotencyHeader: "",
  callbackUrl: "",
  includeDatasets: "employees,payroll,attendance,sales,purchases",
  payloadMode: "base",
  incremental: "true",
  maxInvoicesPerSync: "100",
  headersJson: "{}",
  mappingJson: "{}",
  payloadTemplateJson: "{}",
  apiKey: "",
  username: "",
  password: "",
  webhookSecret: "",
  webhookSecretPrevious: "",
  webhookToleranceSec: "300",
  certificatePem: "",
  privateKeyPem: "",
};

const CONNECTOR_PRESETS: Record<Integration["connector"], Partial<FormState>> = {
  zatca: {
    authType: "bearer",
    payloadMode: "base",
    incremental: "true",
    maxInvoicesPerSync: "100",
    includeDatasets: "sales",
    retries: "2",
    retryBackoffMs: "1500",
    retryOnStatus: "429,500,502,503,504",
  },
  gosi: {
    authType: "api_key",
    payloadMode: "fields",
    includeDatasets: "employees,payroll",
    retries: "2",
    retryBackoffMs: "1000",
  },
  mudad: {
    authType: "api_key",
    payloadMode: "fields",
    includeDatasets: "employees,payroll,attendance",
    retries: "2",
    retryBackoffMs: "1000",
  },
  custom: {
    authType: "bearer",
    payloadMode: "template",
    includeDatasets: "employees,payroll,attendance,sales,purchases",
    retries: "1",
    retryBackoffMs: "1000",
  },
};

export default function IntegrationsPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [jobs, setJobs] = useState<IntegrationJob[]>([]);
  const [artifacts, setArtifacts] = useState<IntegrationArtifact[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<IntegrationWebhookEvent[]>([]);
  const [replayEventId, setReplayEventId] = useState("");
  const [webhookEventQuery, setWebhookEventQuery] = useState("");
  const [webhookFailedOnly, setWebhookFailedOnly] = useState(false);
  const [latestSyncSummary, setLatestSyncSummary] = useState<LatestSyncSummary | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [reconcileJson, setReconcileJson] = useState(
    JSON.stringify(
      {
        results: [
          {
            uuid: "",
            status: "accepted",
            providerReference: "",
            message: "",
          },
        ],
      },
      null,
      2
    )
  );
  const [previewInvoiceId, setPreviewInvoiceId] = useState("");
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAdmin = ["owner", "admin"].includes(activeCompany?.role ?? "");

  const connectorOptions = useMemo(
    () =>
      CONNECTORS.map((connector) => ({
        ...connector,
        label: t(connector.labelKey),
        description: t(connector.descKey),
      })),
    [t]
  );

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadIntegrations = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/integrations?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setIntegrations(data.integrations ?? []))
      .catch(() => setIntegrations([]));
  }, [activeCompanyId]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const loadDetails = async (integrationId: string) => {
    const webhookParams = new URLSearchParams();
    if (webhookEventQuery.trim()) {
      webhookParams.set("eventId", webhookEventQuery.trim());
    }
    if (webhookFailedOnly) {
      webhookParams.set("failedOnly", "1");
    }
    const webhookUrl = `/api/integrations/${integrationId}/webhook/events${
      webhookParams.toString() ? `?${webhookParams.toString()}` : ""
    }`;

    const [logResponse, jobResponse, artifactResponse, webhookEventResponse] = await Promise.all([
      fetch(`/api/integrations/${integrationId}/logs`),
      fetch(`/api/integrations/${integrationId}/jobs`),
      fetch(`/api/integrations/${integrationId}/artifacts`),
      fetch(webhookUrl),
    ]);
    if (logResponse.ok) {
      const logData = await logResponse.json();
      const nextLogs = (logData.logs ?? []) as IntegrationLog[];
      setLogs(nextLogs);
      const syncSummaryLog = nextLogs.find(
        (entry) =>
          typeof entry?.metadata === "object" &&
          entry.metadata !== null &&
          ("artifactStatusSummary" in entry.metadata ||
            "gosiSummary" in entry.metadata ||
            "mudadSummary" in entry.metadata)
      );
      if (syncSummaryLog?.metadata) {
        setLatestSyncSummary({
          integrationId,
          details: syncSummaryLog.metadata,
          capturedAt: syncSummaryLog.createdAt,
        });
      } else {
        setLatestSyncSummary((current) =>
          current && current.integrationId === integrationId ? null : current
        );
      }
    } else {
      setLogs([]);
      setLatestSyncSummary((current) =>
        current && current.integrationId === integrationId ? null : current
      );
    }
    if (jobResponse.ok) {
      const jobData = await jobResponse.json();
      setJobs(jobData.jobs ?? []);
    } else {
      setJobs([]);
    }
    if (artifactResponse.ok) {
      const artifactData = await artifactResponse.json();
      setArtifacts(artifactData.artifacts ?? []);
    } else {
      setArtifacts([]);
    }
    if (webhookEventResponse.ok) {
      const eventData = await webhookEventResponse.json();
      setWebhookEvents(eventData.events ?? []);
    } else {
      setWebhookEvents([]);
    }
  };

  const handleReplayFailedWebhookEvents = async (integrationId: string) => {
    setErrorKey(null);
    setNoticeKey(null);
    const response = await fetch(`/api/integrations/${integrationId}/webhook/replay-failed`, {
      method: "POST",
    });
    if (!response.ok) {
      setErrorKey("integrations.saveFailed");
      return;
    }
    setNoticeKey("integrations.updated");
    await loadDetails(integrationId);
  };

  const parseJsonObject = (value: string, fallback: Record<string, unknown> = {}) => {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid JSON object");
    }
    return parsed as Record<string, unknown>;
  };

  const parseCsvNumbers = (value: string) =>
    value
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item));

  const parseCsvStrings = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const buildConfig = (state: FormState) => {
    const config: Record<string, unknown> = {
      authType: state.authType,
      testMethod: state.testMethod.trim().toUpperCase() || "GET",
      syncMethod: state.syncMethod.trim().toUpperCase() || "POST",
      timeoutMs: Number(state.timeoutMs) || 15000,
      retries: Number(state.retries) || 1,
      retryBackoffMs: Number(state.retryBackoffMs) || 1000,
      retryOnStatus: parseCsvNumbers(state.retryOnStatus),
      payloadMode: state.payloadMode,
      incremental: state.incremental === "true",
      maxInvoicesPerSync: Number(state.maxInvoicesPerSync) || 100,
      webhookToleranceSec: Number(state.webhookToleranceSec) || 300,
      includeDatasets: parseCsvStrings(state.includeDatasets),
      headers: parseJsonObject(state.headersJson),
      mapping: parseJsonObject(state.mappingJson),
      payloadTemplate: parseJsonObject(state.payloadTemplateJson),
    };
    if (state.endpoint.trim()) {
      config.endpoint = state.endpoint.trim();
    }
    if (state.testEndpoint.trim()) {
      config.testEndpoint = state.testEndpoint.trim();
    }
    if (state.syncEndpoint.trim()) {
      config.syncEndpoint = state.syncEndpoint.trim();
    }
    if (state.apiKeyHeader.trim()) {
      config.apiKeyHeader = state.apiKeyHeader.trim();
    }
    if (state.idempotencyHeader.trim()) {
      config.idempotencyHeader = state.idempotencyHeader.trim();
    }
    if (state.callbackUrl.trim()) {
      config.callbackUrl = state.callbackUrl.trim();
    }
    return config;
  };

  const buildCredentials = (state: FormState) => {
    const credentials: Record<string, unknown> = {};
    if (state.apiKey.trim()) {
      credentials.apiKey = state.apiKey.trim();
    }
    if (state.certificatePem.trim()) {
      credentials.certificatePem = state.certificatePem.trim();
    }
    if (state.privateKeyPem.trim()) {
      credentials.privateKeyPem = state.privateKeyPem.trim();
    }
    if (state.username.trim()) {
      credentials.username = state.username.trim();
    }
    if (state.password.trim()) {
      credentials.password = state.password.trim();
    }
    if (state.webhookSecret.trim()) {
      credentials.webhookSecret = state.webhookSecret.trim();
    }
    if (state.webhookSecretPrevious.trim()) {
      credentials.webhookSecretPrevious = state.webhookSecretPrevious.trim();
    }
    return Object.keys(credentials).length ? credentials : null;
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      try {
        const credentials = buildCredentials(form);
        const response = await fetch("/api/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: activeCompanyId,
            name: form.name,
            connector: form.connector,
            environment: form.environment,
            status: form.status,
            config: buildConfig(form),
            credentials: credentials ?? {},
          }),
        });
        if (!response.ok) {
          setErrorKey("integrations.saveFailed");
          return;
        }
        setForm(EMPTY_FORM);
        setNoticeKey("integrations.created");
        loadIntegrations();
      } catch {
        setErrorKey("integrations.saveFailed");
      }
    });
  };

  const handleStartEdit = (integration: Integration) => {
    setEditingId(integration.id);
    const config = integration.config ?? {};
    setEditForm({
      name: integration.name,
      connector: integration.connector,
      environment: integration.environment,
      status: integration.status,
      endpoint: String(config.endpoint ?? ""),
      testEndpoint: String(config.testEndpoint ?? ""),
      syncEndpoint: String(config.syncEndpoint ?? ""),
      testMethod: String(config.testMethod ?? "GET"),
      syncMethod: String(config.syncMethod ?? "POST"),
      authType:
        (String(config.authType ?? "bearer") as FormState["authType"]) ?? "bearer",
      apiKeyHeader: String(config.apiKeyHeader ?? "X-API-Key"),
      timeoutMs: String(config.timeoutMs ?? 15000),
      retries: String(config.retries ?? 1),
      retryBackoffMs: String(config.retryBackoffMs ?? 1000),
      retryOnStatus: Array.isArray(config.retryOnStatus)
        ? (config.retryOnStatus as unknown[]).join(",")
        : "429,500,502,503,504",
      idempotencyHeader: String(config.idempotencyHeader ?? ""),
      callbackUrl: String(config.callbackUrl ?? ""),
      includeDatasets: Array.isArray(config.includeDatasets)
        ? (config.includeDatasets as unknown[]).join(",")
        : "employees,payroll,attendance,sales,purchases",
      payloadMode:
        (String(config.payloadMode ?? "base") as FormState["payloadMode"]) ?? "base",
      incremental: String(config.incremental ?? true) === "false" ? "false" : "true",
      maxInvoicesPerSync: String(config.maxInvoicesPerSync ?? 100),
      webhookToleranceSec: String(config.webhookToleranceSec ?? 300),
      headersJson: JSON.stringify((config.headers as Record<string, unknown>) ?? {}, null, 2),
      mappingJson: JSON.stringify((config.mapping as Record<string, unknown>) ?? {}, null, 2),
      payloadTemplateJson: JSON.stringify(
        (config.payloadTemplate as Record<string, unknown>) ?? {},
        null,
        2
      ),
      apiKey: "",
      username: "",
      password: "",
      webhookSecret: "",
      webhookSecretPrevious: "",
      certificatePem: "",
      privateKeyPem: "",
    });
  };

  const handleUpdate = () => {
    if (!activeCompanyId || !editingId || !editForm) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      try {
        const credentials = buildCredentials(editForm);
        const payload: Record<string, unknown> = {
          name: editForm.name,
          environment: editForm.environment,
          status: editForm.status,
          config: buildConfig(editForm),
        };
        if (credentials) {
          payload.credentials = credentials;
        }
        const response = await fetch(`/api/integrations/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          setErrorKey("integrations.saveFailed");
          return;
        }
        setEditingId(null);
        setEditForm(null);
        setNoticeKey("integrations.updated");
        loadIntegrations();
      } catch {
        setErrorKey("integrations.saveFailed");
      }
    });
  };

  const handleDeactivate = (integrationId: string) => {
    startTransition(async () => {
      await fetch(`/api/integrations/${integrationId}`, { method: "DELETE" });
      loadIntegrations();
    });
  };

  const handleTest = async (integrationId: string) => {
    setErrorKey(null);
    setNoticeKey(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    const response = await fetch(`/api/integrations/${integrationId}/test`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      setErrorKey("integrations.testFailed");
    } else {
      setNoticeKey("integrations.testSuccess");
    }
    loadIntegrations();
    if (selectedIntegrationId === integrationId) {
      loadDetails(integrationId);
    }
  };

  const handleSync = async (integrationId: string) => {
    setErrorKey(null);
    setNoticeKey(null);
    setValidationErrors([]);
    setValidationWarnings([]);
    const response = await fetch(`/api/integrations/${integrationId}/sync`, {
      method: "POST",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
      setErrorKey("integrations.syncFailed");
    } else {
      setNoticeKey("integrations.syncQueued");
      if (data?.details && typeof data.details === "object") {
        setLatestSyncSummary({
          integrationId,
          details: data.details as Record<string, unknown>,
          capturedAt: new Date().toISOString(),
        });
      }
    }
    if (selectedIntegrationId === integrationId) {
      loadDetails(integrationId);
    }
  };

  const handleValidate = async (integrationId: string) => {
    setErrorKey(null);
    setNoticeKey(null);
    const response = await fetch(`/api/integrations/${integrationId}/validate`);
    const data = await response.json().catch(() => ({}));
    setValidationErrors(Array.isArray(data?.errors) ? data.errors : []);
    setValidationWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
    if (!response.ok || !data?.ok) {
      setErrorKey("integrations.testFailed");
    } else {
      setNoticeKey("integrations.testSuccess");
    }
    if (selectedIntegrationId === integrationId) {
      loadDetails(integrationId);
    }
  };

  const handleSelectIntegration = (integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    setSelectedArtifactId(null);
    loadDetails(integrationId);
  };

  const handlePreviewPayload = async (integrationId: string) => {
    setErrorKey(null);
    setNoticeKey(null);
    const response = await fetch(`/api/integrations/${integrationId}/payload`);
    if (!response.ok) {
      setErrorKey("integrations.previewFailed");
      setPreviewPayload(null);
      return;
    }
    const data = await response.json();
    setPreviewPayload((data?.payload as Record<string, unknown>) ?? null);
    setSelectedIntegrationId(integrationId);
    await loadDetails(integrationId);
  };

  const handlePreviewZatca = async () => {
    if (!activeCompanyId || !previewInvoiceId.trim()) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    const response = await fetch(
      `/api/integrations/zatca/preview?companyId=${activeCompanyId}&invoiceId=${previewInvoiceId.trim()}`
    );
    if (!response.ok) {
      setErrorKey("integrations.previewFailed");
      setPreviewPayload(null);
      return;
    }
    const data = await response.json();
    setPreviewPayload(data.draft ?? null);
  };

  const applyConnectorPreset = (connector: Integration["connector"]) => {
    const preset = CONNECTOR_PRESETS[connector];
    if (!preset) return;
    setForm((prev) => ({ ...prev, connector, ...preset }));
  };

  const handleManualReconcile = async () => {
    if (!selectedIntegrationId) return;
    setErrorKey(null);
    setNoticeKey(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(reconcileJson);
    } catch {
      setErrorKey("integrations.saveFailed");
      return;
    }

    const response = await fetch(`/api/integrations/${selectedIntegrationId}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });

    if (!response.ok) {
      setErrorKey("integrations.saveFailed");
      return;
    }

    setNoticeKey("integrations.updated");
    await loadDetails(selectedIntegrationId);
  };

  const handleReplayWebhookEvent = async (integrationId: string, eventId?: string) => {
    const targetEventId = (eventId ?? replayEventId).trim();
    if (!targetEventId) {
      setErrorKey("integrations.saveFailed");
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    const response = await fetch(`/api/integrations/${integrationId}/webhook/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: targetEventId }),
    });
    if (!response.ok) {
      setErrorKey("integrations.saveFailed");
      return;
    }
    setNoticeKey("integrations.updated");
    setReplayEventId("");
    await loadDetails(integrationId);
  };

  const artifactStatusClass = (status: IntegrationArtifact["status"]) => {
    if (status === "accepted") return "bg-emerald-100 text-emerald-700";
    if (status === "rejected") return "bg-rose-100 text-rose-700";
    if (status === "submitted") return "bg-sky-100 text-sky-700";
    return "bg-amber-100 text-amber-700";
  };

  const selectedSyncSummary =
    latestSyncSummary && latestSyncSummary.integrationId === selectedIntegrationId
      ? latestSyncSummary
      : null;

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("integrations.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("integrations.subtitle")}</p>
      </div>
      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {validationErrors.length > 0 ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {validationErrors.map((issue, index) => (
            <p key={`err-${index}`}>{issue}</p>
          ))}
        </div>
      ) : null}
      {validationWarnings.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {validationWarnings.map((issue, index) => (
            <p key={`warn-${index}`}>{issue}</p>
          ))}
        </div>
      ) : null}
      {noticeKey ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {t(noticeKey)}
        </div>
      ) : null}

      {!isAdmin ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t("integrations.adminOnly")}
        </div>
      ) : null}

      {isAdmin ? (
        <form onSubmit={handleCreate} className="app-card p-6 card-modern">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("integrations.addTitle")}</h2>
            <span className="text-xs text-muted">{t("integrations.credentialsHint")}</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.name")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.connector")}</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.connector}
                onChange={(event) => applyConnectorPreset(event.target.value as Integration["connector"])}
              >
                {connectorOptions.map((connector) => (
                  <option key={connector.key} value={connector.key}>
                    {connector.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.environment")}</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.environment}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    environment: event.target.value as Integration["environment"],
                  }))
                }
              >
                <option value="sandbox">{t("integrations.environment.sandbox")}</option>
                <option value="production">{t("integrations.environment.production")}</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.status")}</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as Integration["status"],
                  }))
                }
              >
                <option value="inactive">{t("integrations.status.inactive")}</option>
                <option value="active">{t("integrations.status.active")}</option>
                <option value="error">{t("integrations.status.error")}</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.endpoint")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.endpoint}
                onChange={(event) => setForm((prev) => ({ ...prev, endpoint: event.target.value }))}
                placeholder={t("integrations.endpointPlaceholder")}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.apiKey")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.apiKey}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder={t("integrations.apiKeyPlaceholder")}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Test Endpoint</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.testEndpoint}
                onChange={(event) => setForm((prev) => ({ ...prev, testEndpoint: event.target.value }))}
                placeholder={t("integrations.endpointPlaceholder")}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Sync Endpoint</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.syncEndpoint}
                onChange={(event) => setForm((prev) => ({ ...prev, syncEndpoint: event.target.value }))}
                placeholder={t("integrations.endpointPlaceholder")}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Callback URL</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.callbackUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, callbackUrl: event.target.value }))}
                placeholder="https://example.com/webhooks/integrations"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Auth Type</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.authType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, authType: event.target.value as FormState["authType"] }))
                }
              >
                <option value="bearer">Bearer</option>
                <option value="api_key">API Key Header</option>
                <option value="basic">Basic Auth</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">API Key Header</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.apiKeyHeader}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKeyHeader: event.target.value }))}
                placeholder="X-API-Key"
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Test Method</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.testMethod}
                onChange={(event) => setForm((prev) => ({ ...prev, testMethod: event.target.value }))}
                placeholder="GET"
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Sync Method</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.syncMethod}
                onChange={(event) => setForm((prev) => ({ ...prev, syncMethod: event.target.value }))}
                placeholder="POST"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Timeout (ms)</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.timeoutMs}
                onChange={(event) => setForm((prev) => ({ ...prev, timeoutMs: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Retries</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.retries}
                onChange={(event) => setForm((prev) => ({ ...prev, retries: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Retry Backoff (ms)</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.retryBackoffMs}
                onChange={(event) => setForm((prev) => ({ ...prev, retryBackoffMs: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Retry on status</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.retryOnStatus}
                onChange={(event) => setForm((prev) => ({ ...prev, retryOnStatus: event.target.value }))}
                placeholder="429,500,502"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Payload Mode</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.payloadMode}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, payloadMode: event.target.value as FormState["payloadMode"] }))
                }
              >
                <option value="base">Base</option>
                <option value="fields">Fields Mapping</option>
                <option value="template">Template</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Datasets</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.includeDatasets}
                onChange={(event) => setForm((prev) => ({ ...prev, includeDatasets: event.target.value }))}
                placeholder="employees,payroll,attendance,sales,purchases"
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Idempotency Header</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.idempotencyHeader}
                onChange={(event) => setForm((prev) => ({ ...prev, idempotencyHeader: event.target.value }))}
                placeholder="Idempotency-Key"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Incremental Sync</span>
              <select
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.incremental}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, incremental: event.target.value as "true" | "false" }))
                }
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Max Invoices/Sync</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.maxInvoicesPerSync}
                onChange={(event) => setForm((prev) => ({ ...prev, maxInvoicesPerSync: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Webhook Secret</span>
              <input
                type="password"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.webhookSecret}
                onChange={(event) => setForm((prev) => ({ ...prev, webhookSecret: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Previous Webhook Secret</span>
              <input
                type="password"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.webhookSecretPrevious}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, webhookSecretPrevious: event.target.value }))
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Webhook Tolerance (sec)</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.webhookToleranceSec}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, webhookToleranceSec: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Username (Basic Auth)</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Password (Basic Auth)</span>
              <input
                type="password"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Headers JSON</span>
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
                value={form.headersJson}
                onChange={(event) => setForm((prev) => ({ ...prev, headersJson: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Mapping JSON</span>
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
                value={form.mappingJson}
                onChange={(event) => setForm((prev) => ({ ...prev, mappingJson: event.target.value }))}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">Template JSON</span>
              <textarea
                className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs"
                value={form.payloadTemplateJson}
                onChange={(event) => setForm((prev) => ({ ...prev, payloadTemplateJson: event.target.value }))}
              />
            </label>
          </div>

          {form.connector === "zatca" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("integrations.certificate")}</span>
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.certificatePem}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, certificatePem: event.target.value }))
                  }
                  placeholder={t("integrations.certificatePlaceholder")}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("integrations.privateKey")}</span>
                <textarea
                  className="min-h-[110px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.privateKeyPem}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, privateKeyPem: event.target.value }))
                  }
                  placeholder={t("integrations.privateKeyPlaceholder")}
                />
              </label>
            </div>
          ) : null}

          <button
            type="submit"
            className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
            disabled={isPending}
          >
            {t("integrations.save")}
          </button>
        </form>
      ) : null}

      <div className="app-card overflow-hidden card-modern">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("integrations.listTitle")}
        </div>
        {integrations.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">{t("integrations.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-xs text-muted thead-modern">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("integrations.name")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("integrations.connector")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("integrations.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("integrations.lastSync")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("integrations.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{integration.name}</p>
                      <p className="text-xs text-muted">{t(`integrations.connector.${integration.connector}`)}</p>
                      {integration.credentialsSet ? (
                        <p className="text-xs text-muted">{t("integrations.credentialsSet")}</p>
                      ) : (
                        <p className="text-xs text-amber-600">{t("integrations.credentialsMissing")}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p>{t(`integrations.connector.${integration.connector}`)}</p>
                      <p className="text-muted">{t(`integrations.environment.${integration.environment}`)}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p className="font-semibold">{t(`integrations.status.${integration.status}`)}</p>
                      {integration.lastError ? (
                        <p className="text-xs text-rose-600">{integration.lastError}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {formatDateTime(integration.lastSyncAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSelectIntegration(integration.id)}
                          className="font-semibold text-primary"
                        >
                          {t("integrations.viewLogs")}
                        </button>
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleValidate(integration.id)}
                              className="font-semibold text-primary"
                            >
                              Validate
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTest(integration.id)}
                              className="font-semibold text-primary"
                            >
                              {t("integrations.test")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSync(integration.id)}
                              className="font-semibold text-primary"
                            >
                              {t("integrations.sync")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePreviewPayload(integration.id)}
                              className="font-semibold text-primary"
                            >
                              {t("integrations.preview")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(integration)}
                              className="font-semibold text-foreground"
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeactivate(integration.id)}
                              className="font-semibold text-red-500"
                            >
                              {t("integrations.deactivate")}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {editingId === integration.id && editForm ? (
                        <div className="mt-4 rounded-2xl border border-border bg-surface px-3 py-3 text-xs">
                          <div className="grid gap-3 md:grid-cols-3">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">{t("integrations.name")}</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.name}
                                onChange={(event) =>
                                  setEditForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">{t("integrations.environment")}</span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.environment}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          environment: event.target.value as Integration["environment"],
                                        }
                                      : prev
                                  )
                                }
                              >
                                <option value="sandbox">{t("integrations.environment.sandbox")}</option>
                                <option value="production">{t("integrations.environment.production")}</option>
                              </select>
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">{t("integrations.status")}</span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.status}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          status: event.target.value as Integration["status"],
                                        }
                                      : prev
                                  )
                                }
                              >
                                <option value="inactive">{t("integrations.status.inactive")}</option>
                                <option value="active">{t("integrations.status.active")}</option>
                                <option value="error">{t("integrations.status.error")}</option>
                              </select>
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">{t("integrations.endpoint")}</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.endpoint}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, endpoint: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">{t("integrations.apiKey")}</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.apiKey}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, apiKey: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Auth Type</span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.authType}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? { ...prev, authType: event.target.value as FormState["authType"] }
                                      : prev
                                  )
                                }
                              >
                                <option value="bearer">Bearer</option>
                                <option value="api_key">API Key Header</option>
                                <option value="basic">Basic Auth</option>
                                <option value="none">None</option>
                              </select>
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Test Endpoint</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.testEndpoint}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, testEndpoint: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Sync Endpoint</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.syncEndpoint}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, syncEndpoint: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Callback URL</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.callbackUrl}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, callbackUrl: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-4">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Timeout</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.timeoutMs}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, timeoutMs: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Retries</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.retries}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, retries: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Backoff</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.retryBackoffMs}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, retryBackoffMs: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Retry Status</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.retryOnStatus}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, retryOnStatus: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Payload Mode</span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.payloadMode}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          payloadMode: event.target.value as FormState["payloadMode"],
                                        }
                                      : prev
                                  )
                                }
                              >
                                <option value="base">Base</option>
                                <option value="fields">Fields</option>
                                <option value="template">Template</option>
                              </select>
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Datasets</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.includeDatasets}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, includeDatasets: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Idempotency Header</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.idempotencyHeader}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, idempotencyHeader: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Incremental Sync</span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.incremental}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, incremental: event.target.value as "true" | "false" } : prev
                                  )
                                }
                              >
                                <option value="true">Enabled</option>
                                <option value="false">Disabled</option>
                              </select>
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Max Invoices/Sync</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.maxInvoicesPerSync}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, maxInvoicesPerSync: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Webhook Secret</span>
                              <input
                                type="password"
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.webhookSecret}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, webhookSecret: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Previous Webhook Secret</span>
                              <input
                                type="password"
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.webhookSecretPrevious}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, webhookSecretPrevious: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Webhook Tolerance (sec)</span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.webhookToleranceSec}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, webhookToleranceSec: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-3">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Headers JSON</span>
                              <textarea
                                className="min-h-[90px] w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.headersJson}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, headersJson: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Mapping JSON</span>
                              <textarea
                                className="min-h-[90px] w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.mappingJson}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, mappingJson: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">Template JSON</span>
                              <textarea
                                className="min-h-[90px] w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.payloadTemplateJson}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, payloadTemplateJson: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          {integration.connector === "zatca" ? (
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className={`text-xs ${alignClass}`}>
                                <span className="mb-1 block text-[11px] text-muted">{t("integrations.certificate")}</span>
                                <textarea
                                  className="min-h-[90px] w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                  value={editForm.certificatePem}
                                  onChange={(event) =>
                                    setEditForm((prev) =>
                                      prev ? { ...prev, certificatePem: event.target.value } : prev
                                    )
                                  }
                                />
                              </label>
                              <label className={`text-xs ${alignClass}`}>
                                <span className="mb-1 block text-[11px] text-muted">{t("integrations.privateKey")}</span>
                                <textarea
                                  className="min-h-[90px] w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                  value={editForm.privateKeyPem}
                                  onChange={(event) =>
                                    setEditForm((prev) =>
                                      prev ? { ...prev, privateKeyPem: event.target.value } : prev
                                    )
                                  }
                                />
                              </label>
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handleUpdate}
                              className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-contrast"
                              disabled={isPending}
                            >
                              {t("integrations.update")}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(null);
                                setEditForm(null);
                              }}
                              className="rounded-lg border border-border px-3 py-1 text-xs font-semibold"
                            >
                              {t("integrations.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedIntegrationId ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card p-6 card-modern">
            <h3 className="text-sm font-semibold">{t("integrations.logsTitle")}</h3>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-muted page-subtitle">{t("integrations.logsEmpty")}</p>
            ) : (
              <div className="mt-3 space-y-3 text-xs">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t(`integrations.logLevel.${log.level}`)}</span>
                      <span className="text-muted">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-muted">{log.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="app-card p-6 card-modern">
            <h3 className="text-sm font-semibold">{t("integrations.jobsTitle")}</h3>
            {jobs.length === 0 ? (
              <p className="mt-3 text-sm text-muted page-subtitle">{t("integrations.jobsEmpty")}</p>
            ) : (
              <div className="mt-3 space-y-3 text-xs">
                {jobs.map((job) => (
                  <div key={job.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t(`integrations.job.${job.type}`)}</span>
                      <span className="text-muted">{formatDateTime(job.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-muted">
                      {t(`integrations.jobStatus.${job.status}`)}
                      {job.lastError ? ` • ${job.lastError}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="app-card p-6 card-modern lg:col-span-2">
            <h3 className="text-sm font-semibold">Latest Sync Summary</h3>
            {!selectedSyncSummary ? (
              <p className="mt-3 text-sm text-muted page-subtitle">
                Run a sync to view provider acceptance/rejection summary.
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                <p className="text-muted">Captured: {formatDateTime(selectedSyncSummary.capturedAt)}</p>
                {selectedSyncSummary.details.artifactStatusSummary ? (
                  <p>
                    ZATCA:
                    {" "}
                    {JSON.stringify(selectedSyncSummary.details.artifactStatusSummary)}
                  </p>
                ) : null}
                {selectedSyncSummary.details.gosiSummary ? (
                  <p>
                    GOSI:
                    {" "}
                    {JSON.stringify(selectedSyncSummary.details.gosiSummary)}
                  </p>
                ) : null}
                {selectedSyncSummary.details.mudadSummary ? (
                  <p>
                    Mudad:
                    {" "}
                    {JSON.stringify(selectedSyncSummary.details.mudadSummary)}
                  </p>
                ) : null}
                {!selectedSyncSummary.details.artifactStatusSummary &&
                !selectedSyncSummary.details.gosiSummary &&
                !selectedSyncSummary.details.mudadSummary ? (
                  <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-surface-muted p-2 text-[11px]">
                    {JSON.stringify(selectedSyncSummary.details, null, 2)}
                  </pre>
                ) : null}
              </div>
            )}
          </div>
          <div className="app-card p-6 card-modern lg:col-span-2">
            <h3 className="text-sm font-semibold">ZATCA Artifacts</h3>
            {selectedIntegrationId ? (
              <div className="mt-2">
                <a
                  href={`/api/integrations/${selectedIntegrationId}/artifacts/export?format=csv`}
                  className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold"
                >
                  Export CSV
                </a>
              </div>
            ) : null}
            {artifacts.length === 0 ? (
              <p className="mt-3 text-sm text-muted page-subtitle">No artifacts yet.</p>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                {artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-semibold">Invoice: {artifact.invoiceId}</p>
                        <p className="text-muted">UUID: {artifact.uuid}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${artifactStatusClass(
                          artifact.status
                        )}`}
                      >
                        {artifact.status}
                      </span>
                    </div>
                    <p className="mt-1 text-muted">
                      Ref: {artifact.providerReference ?? "-"} • Last Submit:{" "}
                      {formatDateTime(artifact.lastSubmittedAt ?? artifact.createdAt)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedArtifactId((current) =>
                          current === artifact.id ? null : artifact.id
                        )
                      }
                      className="mt-2 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold"
                    >
                      {selectedArtifactId === artifact.id ? "Hide details" : "View details"}
                    </button>
                    {selectedArtifactId === artifact.id ? (
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-border bg-surface-muted p-2 text-[11px]">
                        {JSON.stringify(artifact.lastResponse ?? {}, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="app-card p-6 card-modern lg:col-span-2">
            <h3 className="text-sm font-semibold">Webhook Events</h3>
            <p className="mt-1 text-xs text-muted">
              Replay stored webhook events to recover missed or partial artifact updates.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="w-full max-w-sm rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                placeholder="Search event id"
                value={webhookEventQuery}
                onChange={(event) => setWebhookEventQuery(event.target.value)}
              />
              <label className="inline-flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={webhookFailedOnly}
                  onChange={(event) => setWebhookFailedOnly(event.target.checked)}
                />
                Failed only
              </label>
              <button
                type="button"
                onClick={() => loadDetails(selectedIntegrationId!)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              >
                Apply Filter
              </button>
              <button
                type="button"
                onClick={() => handleReplayFailedWebhookEvents(selectedIntegrationId!)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              >
                Replay Failed
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="w-full max-w-lg rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                placeholder="Webhook event id"
                value={replayEventId}
                onChange={(event) => setReplayEventId(event.target.value)}
              />
              <button
                type="button"
                onClick={() => handleReplayWebhookEvent(selectedIntegrationId!)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold"
              >
                Replay Event
              </button>
            </div>
            {webhookEvents.length === 0 ? (
              <p className="mt-3 text-sm text-muted page-subtitle">No webhook events recorded yet.</p>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                {webhookEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{event.id}</p>
                      <button
                        type="button"
                        onClick={() => handleReplayWebhookEvent(selectedIntegrationId!, event.id)}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold"
                      >
                        Replay
                      </button>
                    </div>
                    <p className="mt-1 text-muted">
                      Created: {formatDateTime(event.createdAt)} • Processed:{" "}
                      {formatDateTime(event.processedAt ?? null)} • Replays: {event.replayCount}
                    </p>
                    <p className="mt-1 text-muted">
                      Last replay: {formatDateTime(event.lastReplayAt ?? null)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="app-card p-6 card-modern lg:col-span-2">
            <h3 className="text-sm font-semibold">Manual Reconcile</h3>
            <p className="mt-1 text-xs text-muted">
              Paste provider result payload and apply status updates to matched UUID artifacts.
            </p>
            <textarea
              className="mt-3 min-h-[180px] w-full rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-xs"
              value={reconcileJson}
              onChange={(event) => setReconcileJson(event.target.value)}
            />
            <button
              type="button"
              onClick={handleManualReconcile}
              className="mt-3 rounded-2xl border border-border px-4 py-2 text-xs font-semibold"
            >
              Apply Reconcile
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-card p-6 card-modern">
        <h3 className="text-sm font-semibold">{t("integrations.zatcaPreviewTitle")}</h3>
        <p className="mt-1 text-xs text-muted">{t("integrations.zatcaPreviewSubtitle")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="w-full max-w-sm rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
            value={previewInvoiceId}
            onChange={(event) => setPreviewInvoiceId(event.target.value)}
            placeholder={t("integrations.invoiceIdPlaceholder")}
          />
          <button
            type="button"
            onClick={handlePreviewZatca}
            className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold"
          >
            {t("integrations.preview")}
          </button>
        </div>
        {previewPayload ? (
          <pre className="mt-4 max-h-80 overflow-auto rounded-2xl border border-border bg-surface-muted p-3 text-xs">
            {JSON.stringify(previewPayload, null, 2)}
          </pre>
        ) : (
          <p className="mt-3 text-xs text-muted">{t("integrations.previewEmpty")}</p>
        )}
      </div>
    </section>
  );
}
