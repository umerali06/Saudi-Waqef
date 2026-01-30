"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";

const RECENT_COMPANY_LIMIT = 5;

export function CompanySwitcher() {
  const { companies, activeCompanyId, setActiveCompanyId } = useCompany();
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslations();
  const { isDirty, markClean } = useUnsavedChanges();
  const [recentCompanyIds, setRecentCompanyIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem("recent_companies");
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setRecentCompanyIds(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      setRecentCompanyIds([]);
    }
  }, []);

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    setRecentCompanyIds((prev) => {
      const next = [
        activeCompanyId,
        ...prev.filter((id) => id !== activeCompanyId),
      ].slice(0, RECENT_COMPANY_LIMIT);
      window.localStorage.setItem("recent_companies", JSON.stringify(next));
      return next;
    });
  }, [activeCompanyId]);

  const { recentCompanies, otherCompanies } = useMemo(() => {
    const map = new Map(companies.map((company) => [company.id, company]));
    const recent = recentCompanyIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((company) => company!);
    const recentSet = new Set(recent.map((company) => company.id));
    const others = companies.filter((company) => !recentSet.has(company.id));
    return { recentCompanies: recent, otherCompanies: others };
  }, [companies, recentCompanyIds]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const companyId = event.target.value;
    if (isDirty) {
      const confirmed = window.confirm(t("common.unsavedChangesConfirm"));
      if (!confirmed) {
        return;
      }
      markClean();
    }
    startTransition(async () => {
      await fetch("/api/companies/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      setActiveCompanyId(companyId);
    });
  };

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted">{t("nav.activeCompany")}</span>
      <select
        value={activeCompanyId ?? ""}
        onChange={handleChange}
        className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
        disabled={isPending}
      >
        {recentCompanies.length > 0 ? (
          <optgroup label={t("companySwitcher.recent")}>
            {recentCompanies.map((company) => (
              <option key={`recent-${company.id}`} value={company.id}>
                {company.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {otherCompanies.length > 0 ? (
          <optgroup label={t("companySwitcher.all")}>
            {otherCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
