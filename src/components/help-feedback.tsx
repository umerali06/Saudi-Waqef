"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { useCompany } from "@/components/company-provider";

export function HelpFeedback({
  articleId,
  page,
}: {
  articleId?: string;
  page: string;
}) {
  const { t, locale } = useTranslations();
  const { activeCompanyId } = useCompany();
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [sending, setSending] = useState(false);

  const submitFeedback = async () => {
    if (!rating) {
      setStatus("error");
      return;
    }
    setSending(true);
    setStatus("idle");
    try {
      const response = await fetch("/api/help/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleId,
          page,
          rating,
          message,
          locale,
          companyId: activeCompanyId,
        }),
      });
      if (!response.ok) {
        throw new Error();
      }
      setMessage("");
      setRating(null);
      setStatus("sent");
    } catch {
      setStatus("error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app-panel space-y-3 p-4 text-sm">
      <p className="font-semibold">{t("help.feedback.title")}</p>
      <p className="text-xs text-muted">{t("help.feedback.prompt")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRating(5)}
          className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
            rating === 5
              ? "border-primary bg-primary text-primary-contrast"
              : "border-border text-foreground hover:bg-surface-muted"
          }`}
        >
          {t("help.feedback.helpful")}
        </button>
        <button
          type="button"
          onClick={() => setRating(2)}
          className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${
            rating === 2
              ? "border-primary bg-primary text-primary-contrast"
              : "border-border text-foreground hover:bg-surface-muted"
          }`}
        >
          {t("help.feedback.notHelpful")}
        </button>
      </div>
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={t("help.feedback.messagePlaceholder")}
        className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
      />
      {status === "sent" ? (
        <p className="text-xs text-emerald-600">{t("help.feedback.thanks")}</p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs text-rose-600">{t("help.feedback.error")}</p>
      ) : null}
      <button
        type="button"
        onClick={submitFeedback}
        disabled={sending}
        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sending ? t("common.loading") : t("help.feedback.submit")}
      </button>
    </div>
  );
}
