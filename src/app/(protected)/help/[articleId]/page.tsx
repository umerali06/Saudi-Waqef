"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "@/i18n/provider";
import { SkeletonBlock, SkeletonSection } from "@/components/skeleton";

type Article = {
  id: string;
  categoryId: string;
  titleAr: string;
  titleEn: string;
  summaryAr?: string | null;
  summaryEn?: string | null;
  contentAr: string;
  contentEn: string;
  tags: string[];
  createdAt: string;
  updatedAt?: string | null;
};

type Category = {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
};

export default function HelpArticlePage() {
  const { t, locale } = useTranslations();
  const params = useParams();
  const router = useRouter();
  const articleId = params?.articleId as string;
  const [article, setArticle] = useState<Article | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!articleId) {
      return;
    }
    setLoading(true);
    setErrorKey(null);
    fetch(`/api/help/articles/${articleId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setArticle(data.article ?? null);
        setCategory(data.category ?? null);
      })
      .catch(() => setErrorKey("help.article.notFound"))
      .finally(() => setLoading(false));
  }, [articleId]);

  const displayTitle = useMemo(() => {
    if (!article) {
      return "";
    }
    return locale === "ar" ? article.titleAr : article.titleEn;
  }, [article, locale]);

  const displaySummary = useMemo(() => {
    if (!article) {
      return "";
    }
    return locale === "ar" ? article.summaryAr : article.summaryEn;
  }, [article, locale]);

  const displayContent = useMemo(() => {
    if (!article) {
      return "";
    }
    return locale === "ar" ? article.contentAr : article.contentEn;
  }, [article, locale]);

  const displayCategory = useMemo(() => {
    if (!category) {
      return "";
    }
    return locale === "ar" ? category.nameAr : category.nameEn;
  }, [category, locale]);

  const formattedUpdated = useMemo(() => {
    if (!article?.updatedAt) {
      return "";
    }
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(article.updatedAt));
  }, [article, locale]);

  const handleSubmitFeedback = () => {
    if (!article || !rating) {
      return;
    }
    setSent(false);
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId: article.id,
          rating,
          message,
          locale,
        }),
      });
      if (!response.ok) {
        setErrorKey("help.article.feedbackError");
        return;
      }
      setSent(true);
      setMessage("");
    });
  };

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-8 w-24" />
        </div>
        <div className="app-card space-y-3 p-5">
          <SkeletonBlock className="h-4 w-64" />
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-5/6" />
        </div>
        <SkeletonSection titleWidth="w-32">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-11/12" />
          <SkeletonBlock className="h-3 w-10/12" />
        </SkeletonSection>
      </section>
    );
  }

  if (!article || errorKey) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("help.article.title")}</h1>
            <p className="text-sm text-muted">{t("help.article.subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/help")}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {t("help.back")}
          </button>
        </div>
        <div className="app-panel p-4 text-sm text-muted">
          {t(errorKey ?? "help.article.notFound")}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{displayCategory || t("help.articlesTitle")}</p>
          <h1 className="text-2xl font-semibold">{displayTitle}</h1>
          {displaySummary ? (
            <p className="mt-2 text-sm text-muted">{displaySummary}</p>
          ) : null}
          {formattedUpdated ? (
            <p className="mt-1 text-xs text-muted">
              {t("help.article.updated", { date: formattedUpdated })}
            </p>
          ) : null}
        </div>
        <Link
          href="/help"
          className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
        >
          {t("help.back")}
        </Link>
      </div>

      <div className="app-card space-y-4 p-5">
        <div className="whitespace-pre-line text-sm leading-7 text-foreground">
          {displayContent}
        </div>
        {article.tags?.length ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted">
            {article.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-surface-muted px-2 py-1">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="app-card space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">{t("help.article.feedbackTitle")}</h2>
          <p className="text-xs text-muted">{t("help.article.feedbackPrompt")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                rating === value
                  ? "border-primary bg-primary text-primary-contrast"
                  : "border-border text-foreground hover:bg-surface-muted"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted">
            {t("help.article.feedbackMessage")}
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("help.article.feedbackPlaceholder")}
            className="min-h-[120px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
        {errorKey ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {sent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t("help.article.feedbackSuccess")}
          </div>
        ) : null}
        <button
          type="button"
          className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          onClick={handleSubmitFeedback}
          disabled={isPending || !rating}
        >
          {isPending ? t("common.loading") : t("help.article.feedbackSubmit")}
        </button>
      </div>
    </section>
  );
}
