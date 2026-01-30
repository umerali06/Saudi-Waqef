"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";

type ImportEntity = "items" | "customers" | "vendors" | "opening_balances";

type ImportError = {
  row: number;
  field?: string;
  code: string;
  message?: string;
};

type ImportSummary = {
  created: number;
  errors: ImportError[];
  mode: "import" | "validate";
};

type ImportJob = {
  id: string;
  entity: ImportEntity;
  status: "completed" | "completed_with_errors" | "failed";
  totalRows: number;
  createdCount: number;
  errorCount: number;
  createdByEmail?: string | null;
  createdAt: string;
};

const ENTITY_CONFIG: Record<
  ImportEntity,
  { labelKey: string; endpoint: string; templateEndpoint: string; summaryKey: string; errorsKey: string }
> = {
  items: {
    labelKey: "imports.entity.items",
    endpoint: "/api/items/import",
    templateEndpoint: "/api/items/import",
    summaryKey: "items.importSummary",
    errorsKey: "items.importErrors",
  },
  customers: {
    labelKey: "imports.entity.customers",
    endpoint: "/api/customers/import",
    templateEndpoint: "/api/customers/import",
    summaryKey: "customers.importSummary",
    errorsKey: "customers.importErrors",
  },
  vendors: {
    labelKey: "imports.entity.vendors",
    endpoint: "/api/vendors/import",
    templateEndpoint: "/api/vendors/import",
    summaryKey: "vendors.importSummary",
    errorsKey: "vendors.importErrors",
  },
  opening_balances: {
    labelKey: "imports.entity.opening_balances",
    endpoint: "/api/opening-balances/import",
    templateEndpoint: "/api/opening-balances/import",
    summaryKey: "opening.importSummary",
    errorsKey: "opening.importErrors",
  },
};

const INITIAL_FILES = {
  items: null,
  customers: null,
  vendors: null,
  opening_balances: null,
} as Record<ImportEntity, File | null>;

const INITIAL_SUMMARIES = {
  items: null,
  customers: null,
  vendors: null,
  opening_balances: null,
} as Record<ImportEntity, ImportSummary | null>;

const INITIAL_LOADING = {
  items: false,
  customers: false,
  vendors: false,
  opening_balances: false,
} as Record<ImportEntity, boolean>;

export default function DataImportsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [files, setFiles] = useState(INITIAL_FILES);
  const [summaries, setSummaries] = useState(INITIAL_SUMMARIES);
  const [loading, setLoading] = useState(INITIAL_LOADING);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadJobs = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/import-jobs?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setJobs(data.jobs ?? []))
      .catch(() => setJobs([]));
  }, [activeCompanyId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const mapServerError = (message?: string) => {
    switch (message) {
      case "Invalid payload":
        return "imports.error.invalidPayload";
      case "Missing headers":
        return "imports.error.missingHeaders";
      case "Missing name column":
        return "imports.error.missingNameColumn";
      case "Missing baseUnit column":
        return "imports.error.missingBaseUnitColumn";
      case "Missing account column":
        return "imports.error.missingAccountColumn";
      case "Missing amount columns":
        return "imports.error.missingAmountColumn";
      default:
        return "imports.error.failed";
    }
  };

  const formatItemError = (error: ImportError) => {
    if (error.message) {
      return error.message;
    }
    switch (error.code) {
      case "missing_name":
        return t("items.import.missingName");
      case "missing_base_unit":
        return t("items.import.missingBaseUnit");
      case "invalid_type":
        return t("items.import.invalidType");
      case "invalid_service":
        return t("items.import.invalidService");
      case "invalid_status":
        return t("items.import.invalidStatus");
      case "invalid_track_inventory":
        return t("items.import.invalidTrack");
      case "invalid_pack_size":
        return t("items.import.invalidPackSize");
      case "missing_pack_size":
        return t("items.import.missingPackSize");
      case "missing_pack_unit":
        return t("items.import.missingPackUnit");
      case "invalid_sale_price":
        return t("items.import.invalidSalePrice");
      case "invalid_purchase_price":
        return t("items.import.invalidPurchasePrice");
      case "invalid_min_stock":
        return t("items.import.invalidMinStock");
      case "invalid_tax":
        return t("items.import.invalidTax");
      case "invalid_income":
        return t("items.import.invalidIncomeAccount");
      case "invalid_expense":
        return t("items.import.invalidExpenseAccount");
      case "duplicate_name":
        return t("items.import.duplicateName");
      case "duplicate_sku":
        return t("items.import.duplicateSku");
      case "duplicate_barcode":
        return t("items.import.duplicateBarcode");
      default:
        return t("items.import.invalidRow");
    }
  };

  const formatPartyError = (error: ImportError) => {
    if (error.message) {
      return error.message;
    }
    switch (error.code) {
      case "missing_name":
        return t("import.missingName");
      case "invalid_status":
        return t("import.invalidStatus");
      case "invalid_vat_registered":
        return t("import.invalidVatFlag");
      case "duplicate_name":
        return t("import.duplicateName");
      case "duplicate_vat_number":
        return t("import.duplicateVatNumber");
      case "invalid_vat_number":
        return t("import.invalidVatNumber");
      case "invalid_credit_limit":
        return t("import.invalidCreditLimit");
      case "invalid_email":
        return t("import.invalidEmail");
      case "invalid_name":
        return t("import.invalidName");
      default:
        return t("import.invalidRow");
    }
  };

  const formatOpeningError = (error: ImportError) => {
    if (error.message) {
      return error.message;
    }
    switch (error.code) {
      case "missing_account":
        return t("opening.import.missingAccount");
      case "invalid_account":
        return t("opening.import.invalidAccount");
      case "invalid_debit":
        return t("opening.import.invalidDebit");
      case "invalid_credit":
        return t("opening.import.invalidCredit");
      case "both_amounts":
        return t("opening.import.bothAmounts");
      case "missing_amount":
        return t("opening.import.missingAmount");
      case "duplicate_account":
        return t("opening.import.duplicateAccount");
      case "invalid_date":
        return t("opening.import.invalidDate");
      case "mixed_date":
        return t("opening.import.mixedDate");
      case "period_locked":
        return t("opening.import.periodLocked");
      case "period_closed":
        return t("opening.import.periodClosed");
      case "unbalanced":
        return t("opening.import.unbalanced");
      default:
        return t("import.invalidRow");
    }
  };

  const formatImportError = (entity: ImportEntity, error: ImportError) => {
    if (entity === "items") {
      return formatItemError(error);
    }
    if (entity === "opening_balances") {
      return formatOpeningError(error);
    }
    return formatPartyError(error);
  };

  const formatFieldLabel = (entity: ImportEntity, field?: string) => {
    if (!field) {
      return "";
    }
    if (entity === "items") {
      const map: Record<string, string> = {
        name: t("items.name"),
        type: t("items.type"),
        sku: t("items.sku"),
        barcode: t("items.barcode"),
        category: t("items.category"),
        brand: t("items.brand"),
        baseUnit: t("items.baseUnit"),
        packUnit: t("items.packUnit"),
        packSize: t("items.packSize"),
        salePrice: t("items.salePrice"),
        purchasePrice: t("items.purchasePrice"),
        taxCategory: t("items.taxCategory"),
        incomeAccount: t("items.incomeAccount"),
        expenseAccount: t("items.expenseAccount"),
        trackInventory: t("items.trackInventory"),
        minStock: t("items.minStock"),
        status: t("common.status"),
      };
      return map[field] ?? field;
    }

    if (entity === "opening_balances") {
      const map: Record<string, string> = {
        accountCode: t("coa.code"),
        accountName: t("coa.name"),
        debit: t("opening.debit"),
        credit: t("opening.credit"),
        asOfDate: t("opening.asOfDate"),
      };
      return map[field] ?? field;
    }

    const nameKey = entity === "customers" ? "customers.name" : "vendors.name";
    const legalKey = entity === "customers" ? "customers.legalName" : "vendors.legalName";
    const map: Record<string, string> = {
      name: t(nameKey),
      legalName: t(legalKey),
      vatNumber: t("companyProfile.vatNumber"),
      crNumber: t("companyProfile.crNumber"),
      email: t("common.email"),
      phone: t("common.phone"),
      billingAddress: t("customers.billingAddress"),
      shippingAddress: t("customers.shippingAddress"),
      paymentTermId: t("invoice.paymentTerm"),
      creditLimit: t("customers.creditLimit"),
      currency: t("customers.currency"),
      notes: t("common.notes"),
      tags: t("common.tags"),
      status: t("common.status"),
      vatRegistered: t("customers.vatRegistered"),
    };
    return map[field] ?? field;
  };

  const handleImport = (entity: ImportEntity, mode: "import" | "validate" = "import") => {
    if (!activeCompanyId || !files[entity]) {
      return;
    }
    setErrorKey(null);
    setSummaries((prev) => ({ ...prev, [entity]: null }));
    setLoading((prev) => ({ ...prev, [entity]: true }));

    startTransition(async () => {
      try {
        const csv = await files[entity]!.text();
        const response = await fetch(ENTITY_CONFIG[entity].endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: activeCompanyId,
            csv,
            dryRun: mode === "validate",
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setErrorKey(mapServerError(data?.error));
          return;
        }
        setSummaries((prev) => ({
          ...prev,
          [entity]: {
            created: data.created ?? 0,
            errors: data.errors ?? [],
            mode,
          },
        }));
        setFiles((prev) => ({ ...prev, [entity]: null }));
        if (mode === "import") {
          loadJobs();
        }
      } catch {
        setErrorKey("imports.error.failed");
      } finally {
        setLoading((prev) => ({ ...prev, [entity]: false }));
      }
    });
  };

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("imports.title")}</h1>
        <p className="text-sm text-muted">{t("imports.subtitle")}</p>
      </div>
      {errorKey ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {(Object.keys(ENTITY_CONFIG) as ImportEntity[]).map((entity) => {
          const config = ENTITY_CONFIG[entity];
          const summary = summaries[entity];
          return (
            <div key={entity} className="app-card p-5">
              <h2 className="text-lg font-semibold">{t(config.labelKey)}</h2>
              <p className="mt-1 text-xs text-muted">{t("imports.templateHint")}</p>
              <a
                className="mt-3 inline-flex items-center rounded-xl border border-border px-3 py-2 text-xs font-semibold"
                href={`${config.templateEndpoint}?companyId=${activeCompanyId}&lang=${locale}`}
              >
                {t("common.downloadTemplate")}
              </a>
              <div className="mt-4">
                <label className="text-xs text-muted">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="block w-full text-xs"
                    onChange={(event) =>
                      setFiles((prev) => ({
                        ...prev,
                        [entity]: event.target.files?.[0] ?? null,
                      }))
                    }
                  />
                </label>
                <p className="mt-3 text-xs text-muted">{t("imports.validateHint")}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleImport(entity, "validate")}
                    className="w-full rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground"
                    disabled={isPending || loading[entity] || !files[entity]}
                  >
                    {t("imports.validate")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImport(entity, "import")}
                    className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
                    disabled={isPending || loading[entity] || !files[entity]}
                  >
                    {t("common.import")}
                  </button>
                </div>
              </div>
              {summary ? (
                <div className="mt-4 rounded-xl border border-border bg-surface-muted px-3 py-3 text-xs">
                  {summary.mode === "validate" ? (
                    <div className="space-y-1">
                      <p className="font-semibold">{t("imports.validationOnly")}</p>
                      <p>{t("imports.validationCount", { count: String(summary.created) })}</p>
                    </div>
                  ) : (
                    <p>{t(config.summaryKey, { count: String(summary.created) })}</p>
                  )}
                  {summary.errors.length > 0 ? (
                    <div className="mt-2">
                      <p className="font-semibold">{t(config.errorsKey)}</p>
                      <div className="mt-2 space-y-1">
                        {summary.errors.map((error, idx) => (
                          <p key={`${entity}-${idx}`} className="text-muted">
                            {error.row > 0
                              ? t("imports.row", { row: String(error.row) })
                              : t("imports.generalError")}
                            {formatFieldLabel(entity, error.field)
                              ? ` - ${formatFieldLabel(entity, error.field)}: `
                              : ": "}
                            {formatImportError(entity, error)}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="app-card overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t("imports.historyTitle")}
        </div>
        {jobs.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">{t("imports.historyEmpty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-xs text-muted">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.entity")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.status")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.totalRows")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.created")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.errors")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("imports.createdBy")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-3 py-2">{t(`imports.entity.${job.entity}`)}</td>
                    <td className="px-3 py-2">{t(`imports.status.${job.status}`)}</td>
                    <td className="px-3 py-2">{job.totalRows}</td>
                    <td className="px-3 py-2">{job.createdCount}</td>
                    <td className="px-3 py-2">{job.errorCount}</td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {job.createdByEmail ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {formatDateTime(job.createdAt)}
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
