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

type PayslipSummary = {
  id: string;
  periodStart: string;
  periodEnd: string;
  netPay: number;
  currency: string;
};

type LinkStatus = {
  account: { userId: string; name: string; email: string; role: string };
  linked: boolean;
  canManageHr: boolean;
  candidate: { id: string; nameAr: string; nameEn: string } | null;
  notified: boolean;
};

export default function MyProfilePage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [employee, setEmployee] = useState<EmployeeSelf | null>(null);
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [linkStatus, setLinkStatus] = useState<LinkStatus | null>(null);
  const [linkErrorKey, setLinkErrorKey] = useState<string | null>(null);
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

  const loadLinkStatus = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/employees/self/link?companyId=${activeCompanyId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LinkStatus) => setLinkStatus(data))
      .catch(() => setLinkStatus(null));
  }, [activeCompanyId]);

  useEffect(() => {
    loadProfile();
    loadLinkStatus();
  }, [loadProfile, loadLinkStatus]);

  const handleLink = (candidateId: string) => {
    if (!activeCompanyId || !linkStatus) {
      return;
    }
    setLinkErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/employees/${candidateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, userId: linkStatus.account.userId }),
      }).catch(() => null);
      if (!response?.ok) {
        const data = (await response?.json().catch(() => null)) as { error?: string } | null;
        setLinkErrorKey(
          data?.error === "User already linked"
            ? "hr.employees.userAlreadyLinked"
            : "error.saveFailed"
        );
        return;
      }
      loadProfile();
      loadLinkStatus();
    });
  };

  const handleNotifyHr = () => {
    if (!activeCompanyId) {
      return;
    }
    setLinkErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/employees/self/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      }).catch(() => null);
      if (!response?.ok) {
        setLinkErrorKey("error.saveFailed");
        return;
      }
      setLinkStatus((prev) => (prev ? { ...prev, notified: true } : prev));
    });
  };

  useEffect(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/payroll/payslips?companyId=${activeCompanyId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setPayslips(data.payslips ?? []))
      .catch(() => setPayslips([]));
  }, [activeCompanyId]);

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

      {linkStatus ? (
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <dl className="grid flex-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted">{t("common.fullName")}</dt>
                <dd className="font-medium">{linkStatus.account.name || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("common.email")}</dt>
                <dd>
                  <bdi>{linkStatus.account.email}</bdi>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t("common.role")}</dt>
                <dd>{t(`role.${linkStatus.account.role}`)}</dd>
              </div>
            </dl>
            <Link href="/account" className="btn-secondary">
              {t("security.password.title")}
            </Link>
          </div>
        </div>
      ) : null}

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
        <div className="panel space-y-3 p-5 text-sm">
          <p className="font-semibold">{t("hr.self.notLinkedTitle")}</p>
          {linkStatus?.canManageHr ? (
            <>
              <p className="text-muted">
                {linkStatus.candidate
                  ? t("hr.self.candidateFound", {
                      name:
                        locale === "ar"
                          ? linkStatus.candidate.nameAr
                          : linkStatus.candidate.nameEn,
                    })
                  : t("hr.self.noCandidate", { email: linkStatus.account.email })}
              </p>
              <div className="flex flex-wrap gap-3">
                {linkStatus.candidate ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={isPending}
                    onClick={() => handleLink(linkStatus.candidate!.id)}
                  >
                    {t("hr.self.linkMe")}
                  </button>
                ) : null}
                <Link href="/hr/employees" className="btn-secondary">
                  {t("hr.self.openEmployees")}
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted">{t("hr.self.notLinkedDescription")}</p>
              {linkStatus?.notified ? (
                <p>{t("hr.self.hrNotified")}</p>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isPending || !linkStatus}
                  onClick={handleNotifyHr}
                >
                  {t("hr.self.notifyHr")}
                </button>
              )}
            </>
          )}
          {linkErrorKey ? (
            <p role="alert" className="text-[#8f2a23]">
              {t(linkErrorKey)}
            </p>
          ) : null}
        </div>
      )}

      {payslips.length > 0 ? (
        <div className="app-card p-6 card-modern">
          <h2 className="text-lg font-semibold">{t("hr.self.payslips")}</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {payslips.map((payslip) => (
              <li key={payslip.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span dir="ltr">
                  {payslip.periodStart} – {payslip.periodEnd}
                </span>
                <span>
                  {payslip.netPay.toFixed(2)} {payslip.currency}
                </span>
                <a
                  href={`/print/payslips/${payslip.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-foreground underline decoration-dotted"
                >
                  {t("hr.self.viewPayslip")}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
