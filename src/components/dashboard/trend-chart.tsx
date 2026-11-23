"use client";

import { useState } from "react";
import { useTranslations } from "@/i18n/provider";
import { useLocaleFormatters } from "@/i18n/formatters";
import { niceAxisMax, type MonthPoint } from "@/lib/reports/dashboard-metrics";

const TICKS = 4;

/**
 * Twelve months of revenue against expenses. Built from flex columns rather
 * than SVG so it follows the page direction: months run right to left in Arabic.
 */
export function TrendChart({ points, currency }: { points: MonthPoint[]; currency: string }) {
  const { t } = useTranslations();
  const { formatCurrency, formatNumber, localeTag } = useLocaleFormatters({ currency });
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  // A month dominated by credit notes can be negative; bars start at zero.
  const max = niceAxisMax(Math.max(...points.flatMap((p) => [p.revenue, p.expenses]), 0));
  const month = (value: string, style: "short" | "long") =>
    new Intl.DateTimeFormat(localeTag, {
      month: style,
      ...(style === "long" ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00Z`));
  const compact = (value: number) =>
    formatNumber(value, max >= 10000 ? { notation: "compact", maximumFractionDigits: 1 } : {});
  const height = (value: number) => `${Math.max((value / max) * 100, value > 0 ? 1 : 0)}%`;

  const series = [
    { key: "revenue" as const, label: t("dashboard.revenue"), className: "bg-series-1" },
    { key: "expenses" as const, label: t("dashboard.expenses"), className: "bg-series-2" },
  ];
  const current = active === null ? null : points[active];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex gap-4 text-xs text-muted">
          {series.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-[2px] ${item.className}`} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setShowTable((value) => !value)}
        >
          {showTable ? t("dashboard.showChart") : t("dashboard.showTable")}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1.5 text-start font-medium">{t("dashboard.month")}</th>
                {series.map((item) => (
                  <th key={item.key} className="py-1.5 text-end font-medium">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {points.map((point) => (
                <tr key={point.month}>
                  <td className="py-1.5">{month(point.month, "long")}</td>
                  <td className="py-1.5 text-end">{formatCurrency(point.revenue)}</td>
                  <td className="py-1.5 text-end">{formatCurrency(point.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-3" onMouseLeave={() => setActive(null)}>
          <div className="relative h-56 w-11 shrink-0 text-[11px] text-muted tabular-nums">
            {Array.from({ length: TICKS + 1 }, (_, index) => (
              <span
                key={index}
                className="absolute end-0 -translate-y-1/2"
                style={{ top: `${(index / TICKS) * 100}%` }}
              >
                {compact(max - (max / TICKS) * index)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-56">
              {Array.from({ length: TICKS + 1 }, (_, index) => (
                <span
                  key={index}
                  className={`absolute inset-x-0 h-px ${index === TICKS ? "bg-foreground/25" : "bg-border"}`}
                  style={{ top: `${(index / TICKS) * 100}%` }}
                  aria-hidden
                />
              ))}
              <div className="absolute inset-0 flex">
                {points.map((point, index) => (
                  <button
                    key={point.month}
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    aria-label={`${month(point.month, "long")}: ${t("dashboard.revenue")} ${formatCurrency(point.revenue)}, ${t("dashboard.expenses")} ${formatCurrency(point.expenses)}`}
                    className={`chart-hit flex h-full flex-1 items-end justify-center gap-[2px] px-[2px] ${
                      active === index ? "bg-foreground/[0.04]" : ""
                    }`}
                  >
                    {series.map((item) => (
                      <span
                        key={item.key}
                        className={`w-full max-w-3 rounded-t-[4px] transition-[filter] ${item.className} ${
                          active === index ? "brightness-110" : ""
                        }`}
                        style={{ height: height(point[item.key]) }}
                      />
                    ))}
                  </button>
                ))}
              </div>
              {current && active !== null ? (
                <div
                  className="pointer-events-none absolute top-0 z-10 w-44 rounded-md border border-border bg-surface p-2.5 text-xs shadow-md"
                  style={{
                    insetInlineStart: `clamp(0px, calc(${((active + 0.5) / points.length) * 100}% - 5.5rem), calc(100% - 11rem))`,
                  }}
                >
                  <p className="mb-1.5 text-muted">{month(current.month, "long")}</p>
                  {series.map((item) => (
                    <p key={item.key} className="flex items-center gap-2 py-0.5">
                      <span className={`h-0.5 w-3 shrink-0 ${item.className}`} aria-hidden />
                      <span className="font-semibold tabular-nums text-foreground">
                        {formatCurrency(current[item.key])}
                      </span>
                      <span className="ms-auto text-muted">{item.label}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-2 flex text-[11px] text-muted">
              {points.map((point, index) => (
                <span
                  key={point.month}
                  className={`flex-1 truncate text-center ${index % 2 === 1 ? "hidden sm:block" : ""}`}
                >
                  {month(point.month, "short")}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
