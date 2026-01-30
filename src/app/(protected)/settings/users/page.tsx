"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useCompany } from "@/components/company-provider";
import { ROLE_OPTIONS } from "@/lib/constants";
import type { Role } from "@/lib/types";
import { useTranslations } from "@/i18n/provider";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
};

export default function UsersSettingsPage() {
  const { data: session } = useSession();
  const { activeCompanyId, activeCompany } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [roleEdits, setRoleEdits] = useState<Record<string, Role>>({});
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [roleErrorKey, setRoleErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canManageRoles = ["owner", "admin"].includes(activeCompany?.role ?? "");
  const currentUserId = session?.user?.id ?? null;

  const loadMembers = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/users?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const nextMembers = data.users ?? [];
        setMembers(nextMembers);
        const nextEdits: Record<string, Role> = {};
        nextMembers.forEach((member: Member) => {
          nextEdits[member.id] = member.role;
        });
        setRoleEdits(nextEdits);
      })
      .catch(() => setMembers([]));
  }, [activeCompanyId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    setRoleErrorKey(null);
    setInviteLink(null);
    if (!activeCompanyId) {
      setErrorKey("settings.users.selectCompanyError");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, companyId: activeCompanyId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Plan user limit reached") {
          setErrorKey("settings.users.planLimitReached");
        } else if (data?.error === "Subscription inactive") {
          setErrorKey("settings.users.subscriptionInactive");
        } else {
          setErrorKey("settings.users.inviteError");
        }
        return;
      }

      const data = await response.json();
      const link = `${window.location.origin}/invite/${data.token}`;
      setInviteLink(link);
      setEmail("");
    });
  };

  const handleRoleUpdate = (memberId: string) => {
    if (!activeCompanyId) {
      return;
    }
    const nextRole = roleEdits[memberId];
    setRoleErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/users/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, role: nextRole }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Last owner") {
          setRoleErrorKey("settings.users.lastOwner");
        } else {
          setRoleErrorKey("settings.users.roleUpdateFailed");
        }
        return;
      }

      setMembers((prev) =>
        prev.map((member) =>
          member.id === memberId ? { ...member, role: nextRole } : member
        )
      );
    });
  };

  const handleRemove = (memberId: string, memberName: string) => {
    if (!activeCompanyId) {
      return;
    }
    const confirmed = window.confirm(
      t("settings.users.removeConfirm", { name: memberName })
    );
    if (!confirmed) {
      return;
    }
    setRoleErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/users/${memberId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data?.error === "Last owner") {
          setRoleErrorKey("settings.users.lastOwner");
        } else {
          setRoleErrorKey("settings.users.removeFailed");
        }
        return;
      }

      setMembers((prev) => prev.filter((member) => member.id !== memberId));
      setRoleEdits((prev) => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("settings.users.title")}</h1>
          <p className="text-sm text-muted">{t("settings.users.subtitle")}</p>
        </div>
        {canManageRoles ? (
          <a
            href={activeCompanyId ? `/api/users/export?companyId=${activeCompanyId}` : "#"}
            className={`rounded-xl border border-border px-3 py-2 text-xs font-semibold ${
              activeCompanyId ? "" : "pointer-events-none opacity-60"
            }`}
          >
            {t("settings.users.exportCsv")}
          </a>
        ) : null}
      </div>

      <form
        onSubmit={handleInvite}
        className="app-card p-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("common.email")}
            </span>
            <input
              type="email"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
              {t("common.role")}
            </span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              {ROLE_OPTIONS.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {t(`role.${roleKey}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              disabled={isPending}
            >
              {t("common.createInvite")}
            </button>
          </div>
        </div>
        {errorKey ? (
          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {inviteLink ? (
          <div className="mt-3 rounded-xl border border-border bg-surface-muted p-3 text-xs text-muted">
            {t("common.shareInvite")}{" "}
            <span className="font-semibold">{inviteLink}</span>
          </div>
        ) : null}
      </form>

      <div className="app-card">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t("settings.users.teamTitle")}
        </div>
        <div className="divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="px-4 py-3 text-sm">
              <p className="font-medium">{member.name}</p>
              <p className="text-xs text-muted">{member.email}</p>
              {canManageRoles ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <select
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                    value={roleEdits[member.id] ?? member.role}
                    onChange={(event) =>
                      setRoleEdits((prev) => ({
                        ...prev,
                        [member.id]: event.target.value as Role,
                      }))
                    }
                  >
                    {ROLE_OPTIONS.map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {t(`role.${roleKey}`)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg border border-border px-2 py-1 text-xs font-semibold text-foreground"
                    onClick={() => handleRoleUpdate(member.id)}
                    disabled={isPending}
                  >
                    {t("settings.users.updateRole")}
                  </button>
                  {member.id !== currentUserId ? (
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-600"
                      onClick={() => handleRemove(member.id, member.name || member.email)}
                      disabled={isPending}
                    >
                      {t("settings.users.removeAccess")}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  {t("labels.rolePrefix", {
                    role: t(`role.${member.role}`),
                  })}
                </p>
              )}
            </div>
          ))}
        </div>
        {roleErrorKey ? (
          <div className="mx-4 my-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(roleErrorKey)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
