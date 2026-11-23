"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "@/i18n/provider";

export function NoAccessPanel({ email }: { email: string }) {
  const { t } = useTranslations();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    const response = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null);
    if (response?.ok) {
      window.location.assign("/onboarding");
      return;
    }
    setFailed(true);
    setPending(false);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="panel w-full max-w-lg p-7">
        <h1 className="text-xl font-semibold">{t("noAccess.title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{t("noAccess.subtitle", { email })}</p>
        <form onSubmit={handleCreate} className="mt-6 border-t border-border pt-5">
          <h2 className="text-sm font-semibold">{t("noAccess.createTitle")}</h2>
          <label className="mt-3 block text-sm">
            <span className="mb-1.5 block text-muted">{t("noAccess.companyName")}</span>
            <input
              className="w-full border px-3 py-2.5 text-sm"
              value={name}
              minLength={3}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {failed ? <p role="alert" className="mt-2 text-sm text-[#8f2a23]">{t("error.saveFailed")}</p> : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className="btn-primary" disabled={pending || name.trim().length < 3}>
              {t("noAccess.create")}
            </button>
            <button type="button" className="btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
              {t("nav.signOut")}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
