"use client";

import Link from "next/link";
import { useTranslations } from "@/i18n/provider";

export function HelpLink({
  articleId,
  query,
  labelKey = "help.learnMore",
}: {
  articleId?: string;
  query?: string;
  labelKey?: string;
}) {
  const { t } = useTranslations();
  const href = articleId ? `/help/${articleId}` : `/help${query ? `?q=${encodeURIComponent(query)}` : ""}`;

  return (
    <Link
      href={href}
      className="text-xs font-semibold text-primary underline decoration-dotted"
    >
      {t(labelKey)}
    </Link>
  );
}
