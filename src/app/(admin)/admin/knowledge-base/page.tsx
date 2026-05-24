"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "@/i18n/provider";

type Category = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  slug: string;
  order: number;
};

type Article = {
  id: string;
  categoryId: string;
  slug?: string;
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  contentAr: string;
  contentEn: string;
  tags: string[];
  isPublished: boolean;
};

type GlossaryTerm = {
  id: string;
  termAr: string;
  termEn: string;
  definitionAr: string;
  definitionEn: string;
  category?: string | null;
};

export default function AdminKnowledgeBasePage() {
  const { t, locale } = useTranslations();
  const [categories, setCategories] = useState<Category[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categoryForm, setCategoryForm] = useState({
    nameAr: "",
    nameEn: "",
    descriptionAr: "",
    descriptionEn: "",
    slug: "",
    order: "0",
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const [articleForm, setArticleForm] = useState({
    categoryId: "",
    titleAr: "",
    titleEn: "",
    summaryAr: "",
    summaryEn: "",
    contentAr: "",
    contentEn: "",
    tags: "",
    slug: "",
    isPublished: false,
  });
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);

  const [glossaryForm, setGlossaryForm] = useState({
    termAr: "",
    termEn: "",
    definitionAr: "",
    definitionEn: "",
    category: "",
  });
  const [editingGlossaryId, setEditingGlossaryId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [categoriesRes, articlesRes, glossaryRes] = await Promise.all([
        fetch("/api/admin/knowledge-base/categories"),
        fetch("/api/admin/knowledge-base/articles"),
        fetch("/api/admin/knowledge-base/glossary"),
      ]);
      if (!categoriesRes.ok || !articlesRes.ok || !glossaryRes.ok) {
        throw new Error(t("admin.errors.loadFailed"));
      }
      const [categoriesData, articlesData, glossaryData] = await Promise.all([
        categoriesRes.json(),
        articlesRes.json(),
        glossaryRes.json(),
      ]);
      setCategories(categoriesData.categories ?? []);
      setArticles(articlesData.articles ?? []);
      setGlossary(glossaryData.terms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetCategoryForm = () => {
    setCategoryForm({
      nameAr: "",
      nameEn: "",
      descriptionAr: "",
      descriptionEn: "",
      slug: "",
      order: "0",
    });
    setEditingCategoryId(null);
  };

  const resetArticleForm = () => {
    setArticleForm({
      categoryId: "",
      titleAr: "",
      titleEn: "",
      summaryAr: "",
      summaryEn: "",
      contentAr: "",
      contentEn: "",
      tags: "",
      slug: "",
      isPublished: false,
    });
    setEditingArticleId(null);
  };

  const resetGlossaryForm = () => {
    setGlossaryForm({
      termAr: "",
      termEn: "",
      definitionAr: "",
      definitionEn: "",
      category: "",
    });
    setEditingGlossaryId(null);
  };

  const handleCategorySubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        nameAr: categoryForm.nameAr,
        nameEn: categoryForm.nameEn,
        descriptionAr: categoryForm.descriptionAr || null,
        descriptionEn: categoryForm.descriptionEn || null,
        slug: categoryForm.slug || null,
        order: Number(categoryForm.order) || 0,
      };
      const response = await fetch(
        editingCategoryId
          ? `/api/admin/knowledge-base/categories/${editingCategoryId}`
          : "/api/admin/knowledge-base/categories",
        {
          method: editingCategoryId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("admin.errors.updateFailed"));
      }
      resetCategoryForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleArticleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        categoryId: articleForm.categoryId,
        titleAr: articleForm.titleAr,
        titleEn: articleForm.titleEn,
        summaryAr: articleForm.summaryAr || null,
        summaryEn: articleForm.summaryEn || null,
        contentAr: articleForm.contentAr,
        contentEn: articleForm.contentEn,
        tags: articleForm.tags
          ? articleForm.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
          : [],
        slug: articleForm.slug || null,
        isPublished: articleForm.isPublished,
      };
      const response = await fetch(
        editingArticleId
          ? `/api/admin/knowledge-base/articles/${editingArticleId}`
          : "/api/admin/knowledge-base/articles",
        {
          method: editingArticleId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("admin.errors.updateFailed"));
      }
      resetArticleForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleGlossarySubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        termAr: glossaryForm.termAr,
        termEn: glossaryForm.termEn,
        definitionAr: glossaryForm.definitionAr,
        definitionEn: glossaryForm.definitionEn,
        category: glossaryForm.category || null,
      };
      const response = await fetch(
        editingGlossaryId
          ? `/api/admin/knowledge-base/glossary/${editingGlossaryId}`
          : "/api/admin/knowledge-base/glossary",
        {
          method: editingGlossaryId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || t("admin.errors.updateFailed"));
      }
      resetGlossaryForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.errors.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const displayCategoryName = (category: Category) =>
    locale === "ar" ? category.nameAr : category.nameEn;

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    categories.forEach((category) => map.set(category.id, category));
    return map;
  }, [categories]);

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("admin.kb.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("admin.kb.subtitle")}</p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="app-card space-y-4 p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.kb.categoriesTitle")}</h2>
          <p className="text-xs text-muted">{t("admin.kb.categoriesSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categoryNameAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.nameAr}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, nameAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categoryNameEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.nameEn}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, nameEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categoryDescAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.descriptionAr}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, descriptionAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categoryDescEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.descriptionEn}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, descriptionEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categorySlug")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.slug}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, slug: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.categoryOrder")}</span>
            <input
              type="number"
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryForm.order}
              onChange={(event) =>
                setCategoryForm((prev) => ({ ...prev, order: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCategorySubmit}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingCategoryId ? t("admin.kb.categoryUpdate") : t("admin.kb.categorySave")}
          </button>
          {editingCategoryId ? (
            <button
              type="button"
              onClick={resetCategoryForm}
              className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>
        {categories.length === 0 ? (
          <p className="text-xs text-muted">{t("admin.kb.categoryEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className="px-3 py-2 text-left">{t("admin.kb.categoryNameEn")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.categoryNameAr")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.categoryOrder")}</th>
                  <th className="px-3 py-2 text-left">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td className="px-3 py-2">{category.nameEn}</td>
                    <td className="px-3 py-2">{category.nameAr}</td>
                    <td className="px-3 py-2">{category.order}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategoryId(category.id);
                          setCategoryForm({
                            nameAr: category.nameAr,
                            nameEn: category.nameEn,
                            descriptionAr: category.descriptionAr ?? "",
                            descriptionEn: category.descriptionEn ?? "",
                            slug: category.slug,
                            order: String(category.order ?? 0),
                          });
                        }}
                        className="text-xs font-semibold text-primary underline"
                      >
                        {t("admin.kb.categoryEdit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card space-y-4 p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.kb.articlesTitle")}</h2>
          <p className="text-xs text-muted">{t("admin.kb.articlesSubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleCategory")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.categoryId}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, categoryId: event.target.value }))
              }
            >
              <option value="">{t("common.none")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {displayCategoryName(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={articleForm.isPublished}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, isPublished: event.target.checked }))
              }
            />
            {t("admin.kb.articlePublished")}
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleTitleAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.titleAr}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, titleAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleTitleEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.titleEn}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, titleEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleSummaryAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.summaryAr}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, summaryAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleSummaryEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.summaryEn}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, summaryEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleContentAr")}</span>
            <textarea
              className="min-h-[120px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.contentAr}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, contentAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleContentEn")}</span>
            <textarea
              className="min-h-[120px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.contentEn}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, contentEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleTags")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.tags}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, tags: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.articleSlug")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={articleForm.slug}
              onChange={(event) =>
                setArticleForm((prev) => ({ ...prev, slug: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleArticleSubmit}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingArticleId ? t("admin.kb.articleUpdate") : t("admin.kb.articleSave")}
          </button>
          {editingArticleId ? (
            <button
              type="button"
              onClick={resetArticleForm}
              className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>

        {articles.length === 0 ? (
          <p className="text-xs text-muted">{t("admin.kb.articleEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className="px-3 py-2 text-left">{t("admin.kb.articleTitleEn")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.articleCategory")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.articlePublished")}</th>
                  <th className="px-3 py-2 text-left">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {articles.map((article) => (
                  <tr key={article.id}>
                    <td className="px-3 py-2">{article.titleEn}</td>
                    <td className="px-3 py-2">
                      {categoryMap.get(article.categoryId)
                        ? displayCategoryName(categoryMap.get(article.categoryId) as Category)
                        : t("common.na")}
                    </td>
                    <td className="px-3 py-2">
                      {article.isPublished ? t("common.yes") : t("common.no")}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingArticleId(article.id);
                          setArticleForm({
                            categoryId: article.categoryId,
                            titleAr: article.titleAr,
                            titleEn: article.titleEn,
                            summaryAr: article.summaryAr ?? "",
                            summaryEn: article.summaryEn ?? "",
                            contentAr: article.contentAr,
                            contentEn: article.contentEn,
                            tags: article.tags?.join(", ") ?? "",
                            slug: article.slug ?? "",
                            isPublished: article.isPublished,
                          });
                        }}
                        className="text-xs font-semibold text-primary underline"
                      >
                        {t("admin.kb.articleEdit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card space-y-4 p-6 card-modern">
        <div>
          <h2 className="text-lg font-semibold">{t("admin.kb.glossaryTitle")}</h2>
          <p className="text-xs text-muted">{t("admin.kb.glossarySubtitle")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.glossaryTermAr")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={glossaryForm.termAr}
              onChange={(event) =>
                setGlossaryForm((prev) => ({ ...prev, termAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.glossaryTermEn")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={glossaryForm.termEn}
              onChange={(event) =>
                setGlossaryForm((prev) => ({ ...prev, termEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.glossaryDefAr")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={glossaryForm.definitionAr}
              onChange={(event) =>
                setGlossaryForm((prev) => ({ ...prev, definitionAr: event.target.value }))
              }
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.glossaryDefEn")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={glossaryForm.definitionEn}
              onChange={(event) =>
                setGlossaryForm((prev) => ({ ...prev, definitionEn: event.target.value }))
              }
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t("admin.kb.glossaryCategory")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={glossaryForm.category}
              onChange={(event) =>
                setGlossaryForm((prev) => ({ ...prev, category: event.target.value }))
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGlossarySubmit}
            disabled={saving}
            className="rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editingGlossaryId ? t("admin.kb.glossaryUpdate") : t("admin.kb.glossarySave")}
          </button>
          {editingGlossaryId ? (
            <button
              type="button"
              onClick={resetGlossaryForm}
              className="rounded-2xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
            >
              {t("common.cancel")}
            </button>
          ) : null}
        </div>

        {glossary.length === 0 ? (
          <p className="text-xs text-muted">{t("admin.kb.glossaryEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-muted thead-modern">
                <tr>
                  <th className="px-3 py-2 text-left">{t("admin.kb.glossaryTermEn")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.glossaryTermAr")}</th>
                  <th className="px-3 py-2 text-left">{t("admin.kb.glossaryCategory")}</th>
                  <th className="px-3 py-2 text-left">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {glossary.map((term) => (
                  <tr key={term.id}>
                    <td className="px-3 py-2">{term.termEn}</td>
                    <td className="px-3 py-2">{term.termAr}</td>
                    <td className="px-3 py-2">{term.category ?? "--"}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGlossaryId(term.id);
                          setGlossaryForm({
                            termAr: term.termAr,
                            termEn: term.termEn,
                            definitionAr: term.definitionAr,
                            definitionEn: term.definitionEn,
                            category: term.category ?? "",
                          });
                        }}
                        className="text-xs font-semibold text-primary underline"
                      >
                        {t("admin.kb.glossaryEdit")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
