"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

export default function CompanySettingsPage() {
  const { data: session } = useSession();
  const { companies } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [name, setName] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [leaveErrorKey, setLeaveErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const currentUserId = session?.user?.id ?? null;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Plan company limit reached") {
          setErrorKey("settings.company.planLimitReached");
        } else {
          setErrorKey("error.companyCreateFailed");
        }
        return;
      }

      setName("");
      router.refresh();
    });
  };

  const handleLeave = (companyId: string, companyName: string) => {
    if (!currentUserId) {
      return;
    }
    const confirmed = window.confirm(
      t("settings.company.leaveConfirm", { company: companyName })
    );
    if (!confirmed) {
      return;
    }
    setLeaveErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/users/${currentUserId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Last owner") {
          setLeaveErrorKey("settings.users.lastOwner");
        } else {
          setLeaveErrorKey("settings.company.leaveFailed");
        }
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("settings.company.title")}</h1>
        <p className="text-sm text-muted">{t("settings.company.subtitle")}</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="app-card p-4"
      >
        <div className="flex flex-col gap-2">
          <label className={`text-sm font-medium ${alignClass}`}>
            {t("common.companyName")}
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            placeholder={t("settings.company.placeholder")}
            required
          />
          {errorKey ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {t(errorKey)}
            </div>
          ) : null}
          <button
            type="submit"
            className="mt-2 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending}
          >
            {t("common.createCompany")}
          </button>
        </div>
      </form>

      <div className="app-card">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("settings.company.listTitle")}
        </div>
        <div className="divide-y divide-border">
          {companies.map((company) => (
            <div key={company.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{company.name}</p>
              <p className="text-xs text-muted">
                {t("labels.rolePrefix", {
                  role: t(`role.${company.role}`),
                })}
              </p>
              {currentUserId ? (
                <button
                  type="button"
                  className="mt-2 w-fit rounded-lg border border-border px-2 py-1 text-xs font-semibold text-muted transition hover:text-foreground"
                  onClick={() => handleLeave(company.id, company.name)}
                  disabled={isPending}
                >
                  {t("settings.company.leave")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {leaveErrorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(leaveErrorKey)}
        </div>
      ) : null}
    </section>
  );
}
