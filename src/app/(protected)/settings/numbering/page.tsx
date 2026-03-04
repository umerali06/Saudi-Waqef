"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useUnsavedChanges } from "@/components/unsaved-changes";
import { useTranslations } from "@/i18n/provider";
import { buildSequenceNumber } from "@/lib/utils/numbering";
// toast is already imported via useToast hook below
import { SkeletonBlock } from "@/components/skeleton";
import { useToast } from "@/components/toast";

type NumberingConfig = {
  invoicePrefix: string;
  invoiceSuffix: string;
  invoiceNextNumber: number;
  invoicePadding: number;
  invoiceResetYearly: boolean;
  invoiceLastResetYear: number | null;
  billPrefix: string;
  billSuffix: string;
  billNextNumber: number;
  billPadding: number;
  billResetYearly: boolean;
  billLastResetYear: number | null;
  creditPrefix: string;
  creditSuffix: string;
  creditNextNumber: number;
  creditPadding: number;
  creditResetYearly: boolean;
  creditLastResetYear: number | null;
  vendorCreditPrefix: string;
  vendorCreditSuffix: string;
  vendorCreditNextNumber: number;
  vendorCreditPadding: number;
  vendorCreditResetYearly: boolean;
  vendorCreditLastResetYear: number | null;
  receiptPrefix: string;
  receiptSuffix: string;
  receiptNextNumber: number;
  receiptPadding: number;
  receiptResetYearly: boolean;
  receiptLastResetYear: number | null;
  vendorPaymentPrefix: string;
  vendorPaymentSuffix: string;
  vendorPaymentNextNumber: number;
  vendorPaymentPadding: number;
  vendorPaymentResetYearly: boolean;
  vendorPaymentLastResetYear: number | null;
  transferPrefix: string;
  transferSuffix: string;
  transferNextNumber: number;
  transferPadding: number;
  transferResetYearly: boolean;
  transferLastResetYear: number | null;
  adjustmentPrefix: string;
  adjustmentSuffix: string;
  adjustmentNextNumber: number;
  adjustmentPadding: number;
  adjustmentResetYearly: boolean;
  adjustmentLastResetYear: number | null;
  expensePrefix: string;
  expenseSuffix: string;
  expenseNextNumber: number;
  expensePadding: number;
  expenseResetYearly: boolean;
  expenseLastResetYear: number | null;
};

const EMPTY_CONFIG: NumberingConfig = {
  invoicePrefix: "INV-",
  invoiceSuffix: "",
  invoiceNextNumber: 1,
  invoicePadding: 0,
  invoiceResetYearly: false,
  invoiceLastResetYear: null,
  billPrefix: "BILL-",
  billSuffix: "",
  billNextNumber: 1,
  billPadding: 0,
  billResetYearly: false,
  billLastResetYear: null,
  creditPrefix: "CR-",
  creditSuffix: "",
  creditNextNumber: 1,
  creditPadding: 0,
  creditResetYearly: false,
  creditLastResetYear: null,
  vendorCreditPrefix: "VCR-",
  vendorCreditSuffix: "",
  vendorCreditNextNumber: 1,
  vendorCreditPadding: 0,
  vendorCreditResetYearly: false,
  vendorCreditLastResetYear: null,
  receiptPrefix: "RCPT-",
  receiptSuffix: "",
  receiptNextNumber: 1,
  receiptPadding: 0,
  receiptResetYearly: false,
  receiptLastResetYear: null,
  vendorPaymentPrefix: "VPAY-",
  vendorPaymentSuffix: "",
  vendorPaymentNextNumber: 1,
  vendorPaymentPadding: 0,
  vendorPaymentResetYearly: false,
  vendorPaymentLastResetYear: null,
  transferPrefix: "TRF-",
  transferSuffix: "",
  transferNextNumber: 1,
  transferPadding: 0,
  transferResetYearly: false,
  transferLastResetYear: null,
  adjustmentPrefix: "ADJ-",
  adjustmentSuffix: "",
  adjustmentNextNumber: 1,
  adjustmentPadding: 0,
  adjustmentResetYearly: false,
  adjustmentLastResetYear: null,
  expensePrefix: "EXP-",
  expenseSuffix: "",
  expenseNextNumber: 1,
  expensePadding: 0,
  expenseResetYearly: false,
  expenseLastResetYear: null,
};

const SECTIONS = [
  {
    id: "invoice",
    labelKey: "numbering.invoice",
    prefix: "invoicePrefix",
    suffix: "invoiceSuffix",
    next: "invoiceNextNumber",
    padding: "invoicePadding",
    reset: "invoiceResetYearly",
    lastReset: "invoiceLastResetYear",
  },
  {
    id: "bill",
    labelKey: "numbering.bill",
    prefix: "billPrefix",
    suffix: "billSuffix",
    next: "billNextNumber",
    padding: "billPadding",
    reset: "billResetYearly",
    lastReset: "billLastResetYear",
  },
  {
    id: "credit",
    labelKey: "numbering.creditNote",
    prefix: "creditPrefix",
    suffix: "creditSuffix",
    next: "creditNextNumber",
    padding: "creditPadding",
    reset: "creditResetYearly",
    lastReset: "creditLastResetYear",
  },
  {
    id: "vendorCredit",
    labelKey: "numbering.vendorCredit",
    prefix: "vendorCreditPrefix",
    suffix: "vendorCreditSuffix",
    next: "vendorCreditNextNumber",
    padding: "vendorCreditPadding",
    reset: "vendorCreditResetYearly",
    lastReset: "vendorCreditLastResetYear",
  },
  {
    id: "receipt",
    labelKey: "numbering.receipt",
    prefix: "receiptPrefix",
    suffix: "receiptSuffix",
    next: "receiptNextNumber",
    padding: "receiptPadding",
    reset: "receiptResetYearly",
    lastReset: "receiptLastResetYear",
  },
  {
    id: "vendorPayment",
    labelKey: "numbering.vendorPayment",
    prefix: "vendorPaymentPrefix",
    suffix: "vendorPaymentSuffix",
    next: "vendorPaymentNextNumber",
    padding: "vendorPaymentPadding",
    reset: "vendorPaymentResetYearly",
    lastReset: "vendorPaymentLastResetYear",
  },
  {
    id: "transfer",
    labelKey: "numbering.transfer",
    prefix: "transferPrefix",
    suffix: "transferSuffix",
    next: "transferNextNumber",
    padding: "transferPadding",
    reset: "transferResetYearly",
    lastReset: "transferLastResetYear",
  },
  {
    id: "adjustment",
    labelKey: "numbering.adjustment",
    prefix: "adjustmentPrefix",
    suffix: "adjustmentSuffix",
    next: "adjustmentNextNumber",
    padding: "adjustmentPadding",
    reset: "adjustmentResetYearly",
    lastReset: "adjustmentLastResetYear",
  },
  {
    id: "expense",
    labelKey: "numbering.expense",
    prefix: "expensePrefix",
    suffix: "expenseSuffix",
    next: "expenseNextNumber",
    padding: "expensePadding",
    reset: "expenseResetYearly",
    lastReset: "expenseLastResetYear",
  },
] as const;

type Section = (typeof SECTIONS)[number];

type FieldKey = keyof NumberingConfig;

const coerceNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const coerceBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const coerceString = (value: unknown, fallback: string) =>
  typeof value === "string" ? value : fallback;

const coerceYear = (value: unknown) =>
  typeof value === "number" && !Number.isNaN(value) ? value : null;

export default function NumberingSettingsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const { setDirty, markClean } = useUnsavedChanges();
  const { toast } = useToast();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [config, setConfig] = useState<NumberingConfig>(EMPTY_CONFIG);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify(config), [config]);

  const loadConfig = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    markClean();
    setIsLoading(true);
    fetch(`/api/companies/${activeCompanyId}/config`)
      .then((res) => res.json())
      .then((data) => {
        const cfg = data?.config ?? {};
        const nextConfig: NumberingConfig = {
          invoicePrefix: coerceString(cfg.invoicePrefix, EMPTY_CONFIG.invoicePrefix),
          invoiceSuffix: coerceString(cfg.invoiceSuffix, EMPTY_CONFIG.invoiceSuffix),
          invoiceNextNumber: coerceNumber(
            cfg.invoiceNextNumber,
            EMPTY_CONFIG.invoiceNextNumber
          ),
          invoicePadding: coerceNumber(cfg.invoicePadding, EMPTY_CONFIG.invoicePadding),
          invoiceResetYearly: coerceBoolean(
            cfg.invoiceResetYearly,
            EMPTY_CONFIG.invoiceResetYearly
          ),
          invoiceLastResetYear: coerceYear(cfg.invoiceLastResetYear),
          billPrefix: coerceString(cfg.billPrefix, EMPTY_CONFIG.billPrefix),
          billSuffix: coerceString(cfg.billSuffix, EMPTY_CONFIG.billSuffix),
          billNextNumber: coerceNumber(cfg.billNextNumber, EMPTY_CONFIG.billNextNumber),
          billPadding: coerceNumber(cfg.billPadding, EMPTY_CONFIG.billPadding),
          billResetYearly: coerceBoolean(cfg.billResetYearly, EMPTY_CONFIG.billResetYearly),
          billLastResetYear: coerceYear(cfg.billLastResetYear),
          creditPrefix: coerceString(cfg.creditPrefix, EMPTY_CONFIG.creditPrefix),
          creditSuffix: coerceString(cfg.creditSuffix, EMPTY_CONFIG.creditSuffix),
          creditNextNumber: coerceNumber(
            cfg.creditNextNumber,
            EMPTY_CONFIG.creditNextNumber
          ),
          creditPadding: coerceNumber(cfg.creditPadding, EMPTY_CONFIG.creditPadding),
          creditResetYearly: coerceBoolean(
            cfg.creditResetYearly,
            EMPTY_CONFIG.creditResetYearly
          ),
          creditLastResetYear: coerceYear(cfg.creditLastResetYear),
          vendorCreditPrefix: coerceString(
            cfg.vendorCreditPrefix,
            EMPTY_CONFIG.vendorCreditPrefix
          ),
          vendorCreditSuffix: coerceString(
            cfg.vendorCreditSuffix,
            EMPTY_CONFIG.vendorCreditSuffix
          ),
          vendorCreditNextNumber: coerceNumber(
            cfg.vendorCreditNextNumber,
            EMPTY_CONFIG.vendorCreditNextNumber
          ),
          vendorCreditPadding: coerceNumber(
            cfg.vendorCreditPadding,
            EMPTY_CONFIG.vendorCreditPadding
          ),
          vendorCreditResetYearly: coerceBoolean(
            cfg.vendorCreditResetYearly,
            EMPTY_CONFIG.vendorCreditResetYearly
          ),
          vendorCreditLastResetYear: coerceYear(cfg.vendorCreditLastResetYear),
          receiptPrefix: coerceString(cfg.receiptPrefix, EMPTY_CONFIG.receiptPrefix),
          receiptSuffix: coerceString(cfg.receiptSuffix, EMPTY_CONFIG.receiptSuffix),
          receiptNextNumber: coerceNumber(
            cfg.receiptNextNumber,
            EMPTY_CONFIG.receiptNextNumber
          ),
          receiptPadding: coerceNumber(cfg.receiptPadding, EMPTY_CONFIG.receiptPadding),
          receiptResetYearly: coerceBoolean(
            cfg.receiptResetYearly,
            EMPTY_CONFIG.receiptResetYearly
          ),
          receiptLastResetYear: coerceYear(cfg.receiptLastResetYear),
          vendorPaymentPrefix: coerceString(
            cfg.vendorPaymentPrefix,
            EMPTY_CONFIG.vendorPaymentPrefix
          ),
          vendorPaymentSuffix: coerceString(
            cfg.vendorPaymentSuffix,
            EMPTY_CONFIG.vendorPaymentSuffix
          ),
          vendorPaymentNextNumber: coerceNumber(
            cfg.vendorPaymentNextNumber,
            EMPTY_CONFIG.vendorPaymentNextNumber
          ),
          vendorPaymentPadding: coerceNumber(
            cfg.vendorPaymentPadding,
            EMPTY_CONFIG.vendorPaymentPadding
          ),
          vendorPaymentResetYearly: coerceBoolean(
            cfg.vendorPaymentResetYearly,
            EMPTY_CONFIG.vendorPaymentResetYearly
          ),
          vendorPaymentLastResetYear: coerceYear(cfg.vendorPaymentLastResetYear),
          transferPrefix: coerceString(cfg.transferPrefix, EMPTY_CONFIG.transferPrefix),
          transferSuffix: coerceString(cfg.transferSuffix, EMPTY_CONFIG.transferSuffix),
          transferNextNumber: coerceNumber(
            cfg.transferNextNumber,
            EMPTY_CONFIG.transferNextNumber
          ),
          transferPadding: coerceNumber(cfg.transferPadding, EMPTY_CONFIG.transferPadding),
          transferResetYearly: coerceBoolean(
            cfg.transferResetYearly,
            EMPTY_CONFIG.transferResetYearly
          ),
          transferLastResetYear: coerceYear(cfg.transferLastResetYear),
          adjustmentPrefix: coerceString(
            cfg.adjustmentPrefix,
            EMPTY_CONFIG.adjustmentPrefix
          ),
          adjustmentSuffix: coerceString(
            cfg.adjustmentSuffix,
            EMPTY_CONFIG.adjustmentSuffix
          ),
          adjustmentNextNumber: coerceNumber(
            cfg.adjustmentNextNumber,
            EMPTY_CONFIG.adjustmentNextNumber
          ),
          adjustmentPadding: coerceNumber(
            cfg.adjustmentPadding,
            EMPTY_CONFIG.adjustmentPadding
          ),
          adjustmentResetYearly: coerceBoolean(
            cfg.adjustmentResetYearly,
            EMPTY_CONFIG.adjustmentResetYearly
          ),
          adjustmentLastResetYear: coerceYear(cfg.adjustmentLastResetYear),
          expensePrefix: coerceString(cfg.expensePrefix, EMPTY_CONFIG.expensePrefix),
          expenseSuffix: coerceString(cfg.expenseSuffix, EMPTY_CONFIG.expenseSuffix),
          expenseNextNumber: coerceNumber(
            cfg.expenseNextNumber,
            EMPTY_CONFIG.expenseNextNumber
          ),
          expensePadding: coerceNumber(cfg.expensePadding, EMPTY_CONFIG.expensePadding),
          expenseResetYearly: coerceBoolean(
            cfg.expenseResetYearly,
            EMPTY_CONFIG.expenseResetYearly
          ),
          expenseLastResetYear: coerceYear(cfg.expenseLastResetYear),
        };
        setConfig(nextConfig);
        setInitialSnapshot(JSON.stringify(nextConfig));
        markClean();
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setIsLoading(false));
  }, [activeCompanyId, markClean]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!initialSnapshot) {
      return;
    }
    setDirty(snapshot !== initialSnapshot);
  }, [snapshot, initialSnapshot, setDirty]);

  const updateField = <K extends FieldKey>(key: K, value: NumberingConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const previewDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const handleSave = () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/companies/${activeCompanyId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setInitialSnapshot(JSON.stringify(config));
      markClean();
      toast(t("common.saved"), "success");
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("numbering.title")}</h1>
        <p className="text-sm text-muted">{t("numbering.subtitle")}</p>
      </div>

      <div className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("numbering.tokensTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("numbering.tokensHint")}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {["{YYYY}", "{YY}", "{MM}", "{DD}"].map((token) => (
            <span
              key={token}
              className="rounded-full border border-border bg-surface px-3 py-1"
            >
              {token}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card p-5">
              <div className="flex items-center justify-between gap-3">
                <SkeletonBlock className="h-6 w-32" />
                <SkeletonBlock className="h-6 w-24 rounded-full" />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <SkeletonBlock className="mb-2 h-4 w-16" />
                  <SkeletonBlock className="h-10 w-full" />
                </div>
                <div>
                  <SkeletonBlock className="mb-2 h-4 w-16" />
                  <SkeletonBlock className="h-10 w-full" />
                </div>
                <div>
                  <SkeletonBlock className="mb-2 h-4 w-24" />
                  <SkeletonBlock className="h-10 w-full" />
                </div>
                <div>
                  <SkeletonBlock className="mb-2 h-4 w-24" />
                  <SkeletonBlock className="h-10 w-full" />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SkeletonBlock className="h-4 w-4 rounded" />
                  <SkeletonBlock className="h-4 w-32" />
                </div>
              </div>
            </div>
          ))
        ) : (
          SECTIONS.map((section: Section) => {
            const prefix = config[section.prefix as FieldKey] as string;
            const suffix = config[section.suffix as FieldKey] as string;
            const nextNumber = config[section.next as FieldKey] as number;
            const padding = config[section.padding as FieldKey] as number;
            const resetYearly = config[section.reset as FieldKey] as boolean;
            const lastResetYear = config[section.lastReset as FieldKey] as number | null;
            const preview = buildSequenceNumber({
              prefix,
              suffix,
              nextNumber,
              padding,
              resetYearly,
              lastResetYear,
              date: previewDate,
            }).number;

            return (
              <div key={section.id} className="app-card p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{t(section.labelKey)}</h3>
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-xs text-muted">
                    {t("numbering.preview")}: {preview}
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">
                      {t("numbering.prefix")}
                    </span>
                    <input
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={prefix}
                      onChange={(event) =>
                        updateField(section.prefix as FieldKey, event.target.value)
                      }
                    />
                  </label>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">
                      {t("numbering.suffix")}
                    </span>
                    <input
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={suffix}
                      onChange={(event) =>
                        updateField(section.suffix as FieldKey, event.target.value)
                      }
                    />
                  </label>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">
                      {t("numbering.padding")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={padding}
                      onChange={(event) =>
                        updateField(
                          section.padding as FieldKey,
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">
                      {t("numbering.nextNumber")}
                    </span>
                    <input
                      type="number"
                      min={1}
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                      value={nextNumber}
                      onChange={(event) =>
                        updateField(section.next as FieldKey, Number(event.target.value))
                      }
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={resetYearly}
                      onChange={(event) =>
                        updateField(
                          section.reset as FieldKey,
                          event.target.checked
                        )
                      }
                    />
                    {t("numbering.resetYearly")}
                  </label>
                  {lastResetYear ? (
                    <span className="text-xs text-muted">
                      {t("numbering.lastReset", { value: String(lastResetYear) })}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      <button
        type="button"
        className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
        onClick={handleSave}
        disabled={isPending}
      >
        {t("common.save")}
      </button>
    </section>
  );
}
