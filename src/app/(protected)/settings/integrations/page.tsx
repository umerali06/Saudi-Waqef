"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { useToast } from "@/components/toast";

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

type FormState = {
  name: string;
  connector: Integration["connector"];
  environment: Integration["environment"];
  status: Integration["status"];
  endpoint: string;
  apiKey: string;
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
  apiKey: "",
  certificatePem: "",
  privateKeyPem: "",
};

export default function IntegrationsPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState | null>(null);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [jobs, setJobs] = useState<IntegrationJob[]>([]);
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
    const [logResponse, jobResponse] = await Promise.all([
      fetch(`/api/integrations/${integrationId}/logs`),
      fetch(`/api/integrations/${integrationId}/jobs`),
    ]);
    if (logResponse.ok) {
      const logData = await logResponse.json();
      setLogs(logData.logs ?? []);
    } else {
      setLogs([]);
    }
    if (jobResponse.ok) {
      const jobData = await jobResponse.json();
      setJobs(jobData.jobs ?? []);
    } else {
      setJobs([]);
    }
  };

  const buildConfig = (state: FormState) => {
    const config: Record<string, unknown> = {};
    if (state.endpoint.trim()) {
      config.endpoint = state.endpoint.trim();
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
    });
  };

  const handleStartEdit = (integration: Integration) => {
    setEditingId(integration.id);
    setEditForm({
      name: integration.name,
      connector: integration.connector,
      environment: integration.environment,
      status: integration.status,
      endpoint: String(integration.config?.endpoint ?? ""),
      apiKey: "",
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
    const response = await fetch(`/api/integrations/${integrationId}/sync`, {
      method: "POST",
    });
    if (!response.ok) {
      setErrorKey("integrations.syncFailed");
    } else {
      setNoticeKey("integrations.syncQueued");
    }
    if (selectedIntegrationId === integrationId) {
      loadDetails(integrationId);
    }
  };

  const handleSelectIntegration = (integrationId: string) => {
    setSelectedIntegrationId(integrationId);
    loadDetails(integrationId);
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("integrations.title")}</h1>
        <p className="text-sm text-muted">{t("integrations.subtitle")}</p>
      </div>
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

      {!isAdmin ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {t("integrations.adminOnly")}
        </div>
      ) : null}

      {isAdmin ? (
        <form onSubmit={handleCreate} className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{t("integrations.addTitle")}</h2>
            <span className="text-xs text-muted">{t("integrations.credentialsHint")}</span>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.name")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.connector")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.connector}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    connector: event.target.value as Integration["connector"],
                  }))
                }
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.endpoint}
                onChange={(event) => setForm((prev) => ({ ...prev, endpoint: event.target.value }))}
                placeholder={t("integrations.endpointPlaceholder")}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("integrations.apiKey")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.apiKey}
                onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                placeholder={t("integrations.apiKeyPlaceholder")}
              />
            </label>
          </div>

          {form.connector === "zatca" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("integrations.certificate")}</span>
                <textarea
                  className="min-h-[110px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                  className="min-h-[110px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
            disabled={isPending}
          >
            {t("integrations.save")}
          </button>
        </form>
      ) : null}

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("integrations.listTitle")}
        </div>
        {integrations.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">{t("integrations.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-xs text-muted">
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
                        <div className="mt-4 rounded-xl border border-border bg-surface px-3 py-3 text-xs">
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
          <div className="app-card p-5">
            <h3 className="text-sm font-semibold">{t("integrations.logsTitle")}</h3>
            {logs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("integrations.logsEmpty")}</p>
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
          <div className="app-card p-5">
            <h3 className="text-sm font-semibold">{t("integrations.jobsTitle")}</h3>
            {jobs.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t("integrations.jobsEmpty")}</p>
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
        </div>
      ) : null}

      <div className="app-card p-5">
        <h3 className="text-sm font-semibold">{t("integrations.zatcaPreviewTitle")}</h3>
        <p className="mt-1 text-xs text-muted">{t("integrations.zatcaPreviewSubtitle")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            className="w-full max-w-sm rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            value={previewInvoiceId}
            onChange={(event) => setPreviewInvoiceId(event.target.value)}
            placeholder={t("integrations.invoiceIdPlaceholder")}
          />
          <button
            type="button"
            onClick={handlePreviewZatca}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold"
          >
            {t("integrations.preview")}
          </button>
        </div>
        {previewPayload ? (
          <pre className="mt-4 max-h-80 overflow-auto rounded-xl border border-border bg-surface-muted p-3 text-xs">
            {JSON.stringify(previewPayload, null, 2)}
          </pre>
        ) : (
          <p className="mt-3 text-xs text-muted">{t("integrations.previewEmpty")}</p>
        )}
      </div>
    </section>
  );
}
