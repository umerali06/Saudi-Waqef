"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type GlossaryTerm = {
  id: string;
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
  category?: string | null;
};

export default function GlossaryPage() {
  const { t, locale } = useTranslations();
  const [query, setQuery] = useState("");
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTerms = () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/help/glossary?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setTerms(data.terms ?? []))
      .catch(() => setError(t("help.error.load")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTerms();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(loadTerms, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const displayTerm = (term: GlossaryTerm) =>
    locale === "ar" ? term.termAr : term.termEn;
  const displayDefinition = (term: GlossaryTerm) =>
    locale === "ar" ? term.definitionAr : term.definitionEn;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("help.glossary.title")}</h1>
          <p className="text-sm text-muted">{t("help.glossary.subtitle")}</p>
        </div>
        <Link
          href="/help"
          className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
        >
          {t("help.back")}
        </Link>
      </div>

      <div className="app-card p-5">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">{t("help.glossary.searchLabel")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("help.glossary.searchPlaceholder")}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-3 w-64" />
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="app-card space-y-2 p-4">
              <SkeletonBlock className="h-3 w-32" />
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      ) : terms.length === 0 ? (
        <div className="app-panel p-4 text-sm text-muted">{t("help.glossary.empty")}</div>
      ) : (
        <div className="space-y-3">
          {terms.map((term) => (
            <div key={term.id} className="app-card p-4">
              <h3 className="text-sm font-semibold">{displayTerm(term)}</h3>
              <p className="mt-2 text-xs text-muted">{displayDefinition(term)}</p>
              {term.category ? (
                <span className="mt-2 inline-flex rounded-full bg-surface-muted px-2 py-1 text-[11px] text-muted">
                  {term.category}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
