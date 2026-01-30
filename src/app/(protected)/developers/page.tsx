"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  createdByEmail?: string | null;
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
};

type UsageLog = {
  id: string;
  keyId: string;
  endpoint: string;
  method: string;
  status: number;
  error?: string | null;
  createdAt: string;
};

const AVAILABLE_SCOPES = [
  "read:accounting",
  "write:accounting",
  "read:hr",
  "write:hr",
  "read:reports",
  "write:reports",
  "read:settings",
  "write:settings",
];

export default function DeveloperPortalPage() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { t } = useTranslations();
  const { formatDateTime } = useLocaleFormatters();
  const [baseUrl, setBaseUrl] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const isPrivileged = ["owner", "admin"].includes(activeCompany?.role ?? "");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setBaseUrl(window.location.origin);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!activeCompanyId || !isPrivileged) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [keysRes, usageRes] = await Promise.all([
        fetch(`/api/developer/keys?companyId=${activeCompanyId}`),
        fetch(`/api/developer/usage?companyId=${activeCompanyId}`),
      ]);
      if (!keysRes.ok || !usageRes.ok) {
        throw new Error(t("developers.errors.loadFailed"));
      }
      const keysData = await keysRes.json();
      const usageData = await usageRes.json();
      setKeys(keysData.keys ?? []);
      setUsage(usageData.usage ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("developers.errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, isPrivileged, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((value) => value !== scope) : [...prev, scope]
    );
  };

  const handleCreateKey = async () => {
    if (!activeCompanyId) {
      return;
    }
    setLoading(true);
    setError(null);
    setToken(null);
    try {
      const response = await fetch("/api/developer/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name,
          scopes: selectedScopes,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t("developers.errors.saveFailed"));
      }
      setToken(data.key?.token ?? null);
      setName("");
      setSelectedScopes([]);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("developers.errors.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!activeCompanyId) {
      return;
    }
    if (!window.confirm(t("developers.confirmRevoke"))) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/developer/keys/${keyId}?companyId=${activeCompanyId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("developers.errors.saveFailed"));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("developers.errors.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handlePing = async () => {
    if (!token) {
      setTestResult(t("developers.test.needToken"));
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch("/api/developer/ping", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || t("developers.test.failed"));
      }
      setTestResult(t("developers.test.success"));
      await loadData();
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : t("developers.test.failed"));
    } finally {
      setTesting(false);
    }
  };

  const scopesLabel = useMemo(
    () => selectedScopes.map((scope) => t(`developers.scope.${scope}`)).join(", "),
    [selectedScopes, t]
  );

  if (!isPrivileged) {
    return (
      <div className="app-card p-5 text-sm text-muted">
        {t("developers.restricted")}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("developers.title")}</h1>
        <p className="text-sm text-muted">{t("developers.subtitle")}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("developers.overviewTitle")}</h2>
        <p className="text-sm text-muted">{t("developers.overviewSubtitle")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs">
            <p className="font-semibold">{t("developers.baseUrl")}</p>
            <p className="mt-1 text-foreground">{baseUrl || "--"}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs">
            <p className="font-semibold">{t("developers.authHeader")}</p>
            <p className="mt-1 text-foreground">Authorization: Bearer {"<API_KEY>"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <a
            href="/openapi.json"
            className="rounded-xl border border-border px-4 py-2 font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("developers.downloadOpenApi")}
          </a>
          <span className="text-muted">
            {t("developers.openApiHint")}
          </span>
        </div>
      </div>

      <div className="app-card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("developers.keysTitle")}</h2>
          <p className="text-xs text-muted">{t("developers.keysSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("developers.keyName")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              placeholder={t("developers.keyNamePlaceholder")}
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("developers.scopes")}</span>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selectedScopes.includes(scope)
                      ? "border-primary bg-primary text-primary-contrast"
                      : "border-border text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {t(`developers.scope.${scope}`)}
                </button>
              ))}
            </div>
            {selectedScopes.length > 0 ? (
              <p className="mt-2 text-xs text-muted">{scopesLabel}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateKey}
          disabled={loading || name.trim().length < 2}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t("developers.createKey")}
        </button>
        {token ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <p className="font-semibold">{t("developers.keyTokenTitle")}</p>
            <p className="mt-1 break-all text-foreground">{token}</p>
            <p className="mt-2">{t("developers.keyTokenHint")}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePing}
                disabled={testing}
                className="rounded-xl border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {testing ? t("common.loading") : t("developers.test.button")}
              </button>
              {testResult ? <span className="text-xs">{testResult}</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <span>{t("developers.keysListTitle")}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{keys.length}</span>
            <a
              href={activeCompanyId ? `/api/developer/keys/export?companyId=${activeCompanyId}` : "#"}
              className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("developers.exportKeys")}
            </a>
          </div>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-3 w-40" />
                <SkeletonBlock className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("developers.keysEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t("developers.table.name")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.table.prefix")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.table.scopes")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.table.lastUsed")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.table.status")}</th>
                  <th className="px-4 py-2 text-left">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td className="px-4 py-2">
                      <p className="font-semibold">{key.name}</p>
                      <p className="text-xs text-muted">{key.createdByEmail ?? "--"}</p>
                    </td>
                    <td className="px-4 py-2">{key.prefix}••••</td>
                    <td className="px-4 py-2 text-xs">
                      {key.scopes.length > 0
                        ? key.scopes.map((scope) => t(`developers.scope.${scope}`)).join(", ")
                        : t("developers.scope.none")}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : "--"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {key.status === "active"
                        ? t("developers.status.active")
                        : t("developers.status.revoked")}
                    </td>
                    <td className="px-4 py-2">
                      {key.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => handleRevoke(key.id)}
                          className="text-xs font-semibold text-rose-600"
                        >
                          {t("developers.revoke")}
                        </button>
                      ) : (
                        <span className="text-xs text-muted">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <span>{t("developers.usageTitle")}</span>
          <a
            href={activeCompanyId ? `/api/developer/usage/export?companyId=${activeCompanyId}` : "#"}
            className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
              activeCompanyId ? "" : "pointer-events-none opacity-60"
            }`}
          >
            {t("developers.exportUsage")}
          </a>
        </div>
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <SkeletonBlock className="h-3 w-48" />
                <SkeletonBlock className="h-3 w-64" />
              </div>
            ))}
          </div>
        ) : usage.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("developers.usageEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className="px-4 py-2 text-left">{t("developers.usage.endpoint")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.usage.method")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.usage.status")}</th>
                  <th className="px-4 py-2 text-left">{t("developers.usage.timestamp")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usage.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-2">{entry.endpoint}</td>
                    <td className="px-4 py-2">{entry.method}</td>
                    <td className="px-4 py-2">{entry.status}</td>
                    <td className="px-4 py-2 text-xs">{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("developers.examplesTitle")}</h2>
        <p className="text-xs text-muted">{t("developers.examplesSubtitle")}</p>
        <div className="mt-3 rounded-xl border border-border bg-surface px-4 py-3 text-xs">
          <pre className="whitespace-pre-wrap">
{`curl -H "Authorization: Bearer <API_KEY>" \\
  ${baseUrl || "https://your-domain.com"}/api/developer/ping`}
          </pre>
        </div>
      </div>
    </section>
  );
}
