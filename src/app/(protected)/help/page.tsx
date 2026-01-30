"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SkeletonBlock, SkeletonCard } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type Category = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
};

type Article = {
  id: string;
  categoryId: string;
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  tags: string[];
};

export default function HelpCenterPage() {
  const { t, locale } = useTranslations();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("categoryId") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(initialCategory);
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const displayCategoryName = useCallback(
    (category: Category) => (locale === "ar" ? category.nameAr : category.nameEn),
    [locale]
  );

  const displaySummary = useCallback(
    (article: Article) => (locale === "ar" ? article.summaryAr : article.summaryEn),
    [locale]
  );

  const fetchCategories = useCallback(() => {
    setCategoriesLoading(true);
    fetch("/api/help/categories")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setError(t("help.error.load")))
      .finally(() => setCategoriesLoading(false));
  }, [t]);

  const fetchArticles = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (categoryId) {
      params.set("categoryId", categoryId);
    }
    fetch(`/api/help/articles?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => setError(t("help.error.load")))
      .finally(() => setLoading(false));
  }, [query, categoryId, t]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  const filteredCategories = useMemo(
    () =>
      categories
        .slice()
        .sort((a, b) =>
          displayCategoryName(a).localeCompare(displayCategoryName(b))
        ),
    [categories, displayCategoryName]
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("help.title")}</h1>
          <p className="text-sm text-muted">{t("help.subtitle")}</p>
        </div>
        <Link
          href="/help/glossary"
          className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
        >
          {t("help.glossary.link")}
        </Link>
      </div>

      <div className="app-card p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("help.searchLabel")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("help.searchPlaceholder")}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("help.categoryLabel")}</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">{t("common.all")}</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {displayCategoryName(category)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="app-panel space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t("help.categoriesTitle")}</h2>
          {categoriesLoading ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-8 w-full" />
              <SkeletonBlock className="h-8 w-full" />
              <SkeletonBlock className="h-8 w-5/6" />
            </div>
          ) : filteredCategories.length === 0 ? (
            <p className="text-xs text-muted">{t("help.categoriesEmpty")}</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {filteredCategories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => setCategoryId(category.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      categoryId === category.id
                        ? "border-primary bg-primary text-primary-contrast"
                        : "border-border text-foreground hover:bg-surface-muted"
                    }`}
                  >
                    <p className="font-semibold">{displayCategoryName(category)}</p>
                    <p className="text-[11px] opacity-80">
                      {locale === "ar" ? category.descriptionAr : category.descriptionEn}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("help.articlesTitle")}</h2>
            {loading ? (
              <span className="text-xs text-muted">{t("common.loading")}</span>
            ) : null}
          </div>
          {loading ? (
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : articles.length === 0 ? (
            <div className="app-panel p-4 text-sm text-muted">
              {t("help.articlesEmpty")}
            </div>
          ) : (
            <div className="space-y-3">
              {articles.map((article) => (
                <Link
                  key={article.id}
                  href={`/help/${article.id}`}
                  className="block rounded-xl border border-border bg-surface px-4 py-3 text-sm transition hover:border-primary"
                >
                  <h3 className="font-semibold">
                    {locale === "ar" ? article.titleAr : article.titleEn}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {displaySummary(article) ?? t("help.noSummary")}
                  </p>
                  {article.tags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
                      {article.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-surface-muted px-2 py-1">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
