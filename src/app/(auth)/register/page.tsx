"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export default function RegisterPage() {
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    companyName: "",
    phone: "",
    requestedRole: "accountant",
  });

  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    startTransition(async () => {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        if (!res.ok) {
          throw new Error("Failed to submit request");
        }

        setSubmitted(true);
      } catch {
        setError("error.generic"); // Use a generic error or add a specific one
      }
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (submitted) {
    return (
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-slate-900">
            {t("auth.register.success.title")}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {t("auth.register.success.message")}
          </p>
          <div className="mt-6">
            <Link
              href="/login"
              className="font-medium text-primary hover:text-primary/90"
            >
              {t("auth.register.loginLink")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className={`text-center ${alignClass}`}>
        <h1 className="text-2xl font-semibold">{t("auth.register.title")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("auth.register.subtitle")}
        </p>
      </div>

      <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-4 rounded-md shadow-sm">
          <div>
            <label htmlFor="name" className="sr-only">
              {t("auth.register.name")}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className={`relative block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3 ${alignClass}`}
              placeholder={t("auth.register.name")}
              value={formData.name}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="email" className="sr-only">
              {t("auth.register.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className={`relative block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3 ${alignClass}`}
              placeholder={t("auth.register.email")}
              value={formData.email}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="companyName" className="sr-only">
              {t("auth.register.company")}
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              autoComplete="organization"
              required
              className={`relative block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3 ${alignClass}`}
              placeholder={t("auth.register.company")}
              value={formData.companyName}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="phone" className="sr-only">
              {t("auth.register.phone")}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className={`relative block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3 ${alignClass}`}
              placeholder={t("auth.register.phone")}
              value={formData.phone}
              onChange={handleChange}
            />
          </div>
          <div>
            <label htmlFor="requestedRole" className="sr-only">
              {t("auth.register.role")}
            </label>
            <select
              id="requestedRole"
              name="requestedRole"
              required
              className={`relative block w-full rounded-md border-0 py-1.5 text-slate-900 ring-1 ring-inset ring-slate-300 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary sm:text-sm sm:leading-6 px-3 ${alignClass}`}
              value={formData.requestedRole}
              onChange={handleChange}
            >
              <option value="admin">{t("auth.register.role.admin")}</option>
              <option value="accountant">{t("auth.register.role.accountant")}</option>
              <option value="hr">{t("auth.register.role.hr")}</option>
              <option value="employee">{t("role.employee")}</option>
              <option value="viewer">{t("role.viewer")}</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  {t("common.unknown")}
                </h3>
              </div>
            </div>
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="group relative flex w-full justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? t("common.loadingInvite") : t("auth.register.submit")}
          </button>
        </div>
        
        <div className="text-sm text-center">
          <Link href="/login" className="font-medium text-primary hover:text-primary/90">
            {t("auth.register.loginLink")}
          </Link>
        </div>
      </form>
    </div>
  );
}
