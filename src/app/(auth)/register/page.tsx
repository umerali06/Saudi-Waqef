"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";
import {
  JOIN_ROLES,
  registrationErrorFields,
  registrationSchema,
} from "@/lib/validators/registration";

type Kind = "new" | "join";

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  crNumber: "",
  vatNumber: "",
  requestedRole: "employee" as (typeof JOIN_ROLES)[number],
};

const INPUT_CLASS = "w-full border px-3.5 py-2.5 text-sm";

export default function RegisterPage() {
  const { t, locale } = useTranslations();
  const [kind, setKind] = useState<Kind>("new");
  const [form, setForm] = useState(EMPTY_FORM);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const update = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setInvalidFields((prev) => prev.filter((entry) => entry !== field));
  };

  const switchKind = (next: Kind) => {
    setKind(next);
    setInvalidFields([]);
    setErrorKey(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorKey(null);
    const { name, email, companyName, phone, crNumber, vatNumber, requestedRole } = form;
    const payload =
      kind === "new"
        ? { kind, locale, name, email, companyName, phone, crNumber, vatNumber }
        : { kind, locale, name, email, companyName, requestedRole };
    const parsed = registrationSchema.safeParse(payload);
    if (!parsed.success) {
      setInvalidFields(registrationErrorFields(parsed.error));
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!response) {
        setErrorKey("auth.register.errors.network");
        return;
      }
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { fields?: string[] } | null;
        if (data?.fields?.length) {
          setInvalidFields(data.fields);
          return;
        }
        setErrorKey(
          response.status === 429
            ? "auth.register.errors.rateLimited"
            : "auth.register.errors.server"
        );
        return;
      }
      setSubmitted(true);
    });
  };

  if (submitted) {
    return (
      <div role="status">
        <h1 className="text-[1.7rem] font-semibold leading-tight">{t("auth.register.success.title")}</h1>
        <p className="mt-3 text-sm leading-6">
          {t(
            kind === "new"
              ? "auth.register.success.newReview"
              : "auth.register.success.joinReview",
            { company: form.companyName.trim() }
          )}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t("auth.register.success.next", { email: form.email.trim() })}
        </p>
        <Link href="/login" className="btn-secondary mt-6">
          {t("auth.register.success.toLogin")}
        </Link>
      </div>
    );
  }

  const renderField = (options: {
    field: Exclude<keyof typeof EMPTY_FORM, "requestedRole">;
    label: string;
    optional?: boolean;
    hint?: string;
    type?: string;
    ltr?: boolean;
    inputMode?: "numeric" | "tel" | "email";
    autoComplete?: string;
  }) => {
    const { field, label, optional, hint } = options;
    const invalid = invalidFields.includes(field);
    return (
      <div key={field}>
        <label htmlFor={field} className="mb-1.5 block text-sm font-medium">
          {label}
          {optional ? (
            <span className="ms-1 font-normal text-muted">{t("auth.register.optional")}</span>
          ) : null}
        </label>
        <input
          id={field}
          type={options.type ?? "text"}
          dir={options.ltr ? "ltr" : undefined}
          inputMode={options.inputMode}
          autoComplete={options.autoComplete}
          className={INPUT_CLASS}
          value={form[field]}
          onChange={(event) => update(field, event.target.value)}
          required={!optional}
          aria-invalid={invalid}
          aria-describedby={invalid || hint ? `${field}-note` : undefined}
        />
        {invalid ? (
          <p id={`${field}-note`} role="alert" className="mt-1.5 text-xs text-[#8f2a23]">
            {t(`auth.register.invalid.${field}`)}
          </p>
        ) : hint ? (
          <p id={`${field}-note`} className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <h1 className="text-[1.7rem] font-semibold leading-tight">{t("auth.register.title")}</h1>
      <div className="segmented mt-5 w-full" role="group" aria-label={t("auth.register.title")}>
        {(["new", "join"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className="flex-1"
            aria-pressed={kind === option}
            onClick={() => switchKind(option)}
          >
            {t(`auth.register.kind.${option}`)}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">{t(`auth.register.kindHint.${kind}`)}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        {renderField({ field: "name", label: t("auth.register.name"), autoComplete: "name" })}
        {renderField({
          field: "email",
          label: t(kind === "new" ? "auth.register.workEmail" : "auth.register.email"),
          type: "email",
          ltr: true,
          inputMode: "email",
          autoComplete: "email",
        })}
        {kind === "new"
          ? renderField({
              field: "phone",
              label: t("auth.register.mobile"),
              hint: t("auth.register.mobileHint"),
              type: "tel",
              ltr: true,
              inputMode: "tel",
              autoComplete: "tel",
            })
          : null}
        {renderField({
          field: "companyName",
          label: t("auth.register.company"),
          hint: t(`auth.register.companyHint.${kind}`),
          autoComplete: "organization",
        })}
        {kind === "new" ? (
          <>
            {renderField({
              field: "crNumber",
              label: t("auth.register.crNumber"),
              optional: true,
              ltr: true,
              inputMode: "numeric",
            })}
            {renderField({
              field: "vatNumber",
              label: t("auth.register.vatNumber"),
              optional: true,
              ltr: true,
              inputMode: "numeric",
            })}
          </>
        ) : (
          <div>
            <label htmlFor="requestedRole" className="mb-1.5 block text-sm font-medium">
              {t("auth.register.role")}
            </label>
            <select
              id="requestedRole"
              className={INPUT_CLASS}
              value={form.requestedRole}
              onChange={(event) => update("requestedRole", event.target.value)}
            >
              {JOIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`role.${role}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        {errorKey ? (
          <p role="alert" className="rounded-lg bg-[#fbe6e4] px-3.5 py-2.5 text-sm text-[#8f2a23]">
            {t(errorKey)}
          </p>
        ) : null}

        <button
          type="submit"
          className="btn-primary auth-submit"
          disabled={isPending}
        >
          {isPending ? t("common.loading") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-8 text-sm text-muted">
        <Link className="font-medium text-primary hover:underline" href="/login">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </>
  );
}
