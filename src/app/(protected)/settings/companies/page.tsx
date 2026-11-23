"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import type { Role } from "@/lib/types";
import { cleanCompanyName, isValidCompanyName } from "@/lib/validators/registration";

type CompanyRow = {
  id: string;
  name: string;
  role: Role;
  ownerCount: number;
  canLeave: boolean;
};

type CompaniesResponse = {
  userId: string;
  companies: CompanyRow[];
  usage: { owned: number; max: number | null; canCreate: boolean };
};

export default function CompanySettingsPage() {
  const { activeCompanyId, setActiveCompanyId } = useCompany();
  const { t } = useTranslations();
  const [data, setData] = useState<CompaniesResponse | null>(null);
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [leaveErrorKey, setLeaveErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadCompanies = useCallback(
    () =>
      fetch("/api/companies")
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((result: CompaniesResponse) => setData(result))
        .catch(() => setErrorKey("error.loadFailed")),
    []
  );

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const companyName = cleanCompanyName(name);
    if (!isValidCompanyName(companyName)) {
      setErrorKey("auth.register.invalid.companyName");
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName }),
      }).catch(() => null);
      const result = (await response?.json().catch(() => null)) as {
        companyId?: string;
        error?: string;
      } | null;
      if (!response?.ok || !result?.companyId) {
        setErrorKey(
          result?.error === "Plan company limit reached"
            ? "settings.company.planLimitReached"
            : "error.companyCreateFailed"
        );
        return;
      }

      // Switch first, then load onboarding afresh so every list knows the new company.
      await fetch("/api/companies/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: result.companyId }),
      }).catch(() => null);
      setActiveCompanyId(result.companyId);
      window.location.assign("/onboarding");
    });
  };

  const handleLeave = (company: CompanyRow) => {
    if (!data || !window.confirm(t("settings.company.leaveConfirm", { company: company.name }))) {
      return;
    }
    setLeaveErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/users/${data.userId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      }).catch(() => null);
      if (!response?.ok) {
        const result = (await response?.json().catch(() => null)) as { error?: string } | null;
        setLeaveErrorKey(
          result?.error === "Last owner"
            ? "settings.company.lastOwner"
            : "settings.company.leaveFailed"
        );
        return;
      }
      // Leaving the active company moves the user to another one, which needs a fresh load.
      window.location.assign(
        company.id === activeCompanyId ? "/dashboard" : "/settings/companies"
      );
    });
  };

  const usage = data?.usage ?? null;
  const limitReached = usage !== null && !usage.canCreate;

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("settings.company.title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted page-subtitle">
          {t("settings.company.explain")}
        </p>
      </div>

      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{t("settings.company.listTitle")}</h2>
          {usage ? (
            <span className="text-xs text-muted">
              {usage.max === null
                ? t("settings.company.usageUnlimited", { owned: String(usage.owned) })
                : t("settings.company.usage", {
                    owned: String(usage.owned),
                    max: String(usage.max),
                  })}
            </span>
          ) : null}
        </div>
        {!data ? (
          <div className="space-y-3 p-5">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.companies.map((company) => (
              <li
                key={company.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {company.name}
                    {company.id === activeCompanyId ? (
                      <span className="status status-info ms-2">
                        {t("settings.company.current")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {t("labels.rolePrefix", { role: t(`role.${company.role}`) })}
                  </p>
                </div>
                {company.canLeave ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleLeave(company)}
                    disabled={isPending}
                  >
                    {t("settings.company.leave")}
                  </button>
                ) : (
                  <p className="max-w-xs text-xs leading-5 text-muted">
                    {t("settings.company.soleOwner")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {leaveErrorKey ? (
          <p role="alert" className="border-t border-border px-5 py-3 text-sm text-[#8f2a23]">
            {t(leaveErrorKey)}
          </p>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="panel p-5">
        <h2 className="text-sm font-semibold">{t("settings.company.addTitle")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{t("settings.company.addHint")}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1 text-sm">
            <span className="mb-1.5 block font-medium">{t("common.companyName")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full border px-3 py-2 text-sm"
              placeholder={t("settings.company.placeholder")}
              disabled={limitReached}
              required
            />
          </label>
          <button
            type="submit"
            className="btn-primary disabled:opacity-60"
            disabled={isPending || !data || limitReached}
          >
            {t("common.createCompany")}
          </button>
        </div>
        {limitReached ? (
          <p className="mt-3 text-sm text-[#7a4d00]">
            {t("settings.company.limitMessage", {
              owned: String(usage.owned),
              max: String(usage.max ?? usage.owned),
            })}
          </p>
        ) : null}
        {errorKey ? (
          <p role="alert" className="mt-3 text-sm text-[#8f2a23]">
            {t(errorKey)}
          </p>
        ) : null}
      </form>
    </section>
  );
}
