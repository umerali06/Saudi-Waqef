"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

type EmployeeSelf = {
  id: string;
  nameAr: string;
  nameEn: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export default function MyProfilePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [employee, setEmployee] = useState<EmployeeSelf | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isPending, startTransition] = useTransition();

  const loadProfile = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingProfile(true);
    fetch(`/api/employees/self?companyId=${activeCompanyId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("not-found");
        }
        return res.json();
      })
      .then((data) => {
        const record = data.employee as EmployeeSelf | undefined;
        if (!record) {
          setEmployee(null);
          return;
        }
        setEmployee(record);
        setEmail(record.email ?? "");
        setPhone(record.phone ?? "");
        setAddress(record.address ?? "");
      })
      .catch(() => setEmployee(null))
      .finally(() => setLoadingProfile(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSave = () => {
    if (!activeCompanyId || !employee) {
      return;
    }
    setErrorKey(null);
    setSuccessKey(null);
    startTransition(async () => {
      const response = await fetch("/api/employees/self", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setSuccessKey("hr.self.saved");
      loadProfile();
    });
  };

  const displayName = employee
    ? locale === "ar"
      ? employee.nameAr
      : employee.nameEn
    : "";

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("hr.self.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("hr.self.subtitle")}</p>
      </div>

      {loadingProfile ? (
        <div className="app-card space-y-3 p-5 card-modern">
          <SkeletonBlock className="h-4 w-48" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
          <SkeletonBlock className="h-9 w-24" />
        </div>
      ) : employee ? (
        <div className="app-card p-6 card-modern">
          <p className="text-sm text-muted page-subtitle">{displayName}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
              <input
                type="email"
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("hr.employees.address")}</span>
              <input
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
          </div>
          {errorKey ? (
            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
          {successKey ? (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {t(successKey)}
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          >
            {t("common.save")}
          </button>
        </div>
      ) : (
        <div className={`app-panel space-y-2 p-4 text-sm ${alignClass}`}>
          <p className="font-semibold text-foreground">{t("hr.self.notLinkedTitle")}</p>
          <p className="text-muted">{t("hr.self.notLinkedDescription")}</p>
          <Link
            href="/support"
            className="inline-flex items-center text-xs font-semibold text-foreground underline decoration-dotted"
          >
            {t("hr.self.contactSupport")}
          </Link>
        </div>
      )}
    </section>
  );
}
