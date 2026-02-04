"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";

type ItemListItem = {
  id: string;
  name: string;
  type: "product" | "service";
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  trackInventory: boolean;
  minStock?: number | null;
  stockOnHand: number;
  stockReserved: number;
  status: "active" | "inactive";
  tags: string[];
};

type TaxCategory = {
  id: string;
  name: string;
  rate: number;
  type: "standard" | "zero" | "exempt";
  status: "active" | "inactive";
};

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isPosting: boolean;
  status: "active" | "inactive";
};

type ImportError = {
  row: number;
  code?: string;
  field?: string;
  message?: string;
};

type ImportSummary = {
  created: number;
  errors: ImportError[];
};

const formatTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function ItemsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingTaxCategories, setLoadingTaxCategories] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [lowStockFilter, setLowStockFilter] = useState("all");
  const [taxCategoryFilter, setTaxCategoryFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [query, setQuery] = useState("");
  const [bulkStatus, setBulkStatus] = useState<"active" | "inactive">("active");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [type, setType] = useState<"product" | "service">("product");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [baseUnit, setBaseUnit] = useState("");
  const [packUnit, setPackUnit] = useState("");
  const [packSize, setPackSize] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [taxCategoryId, setTaxCategoryId] = useState("");
  const [incomeAccountId, setIncomeAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [trackInventory, setTrackInventory] = useState(false);
  const [minStock, setMinStock] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [tags, setTags] = useState("");
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const formatImportError = (error: ImportError) => {
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

  const formatImportField = (field?: string) => {
    if (!field) {
      return "";
    }
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
  };

  const loadItems = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingItems(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (typeFilter !== "all") {
      params.set("type", typeFilter);
    }
    if (inventoryFilter === "tracked") {
      params.set("trackInventory", "true");
    }
    if (inventoryFilter === "untracked") {
      params.set("trackInventory", "false");
    }
    if (lowStockFilter === "low") {
      params.set("lowStock", "true");
    }
    if (taxCategoryFilter !== "all") {
      params.set("taxCategoryId", taxCategoryFilter);
    }
    if (categoryFilter.trim()) {
      params.set("category", categoryFilter.trim());
    }
    if (query.trim()) {
      params.set("q", query.trim());
    }
    fetch(`/api/items?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        const next = data.items ?? [];
        setItems(next);
        setSelectedIds((prev) =>
          prev.filter((id) => next.some((item: { id: string }) => item.id === id))
        );
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingItems(false));
  }, [
    activeCompanyId,
    categoryFilter,
    inventoryFilter,
    lowStockFilter,
    query,
    statusFilter,
    taxCategoryFilter,
    typeFilter,
  ]);

  const loadTaxCategories = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingTaxCategories(true);
    fetch(`/api/tax-categories?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setTaxCategories(data.categories ?? []))
      .catch(() => setTaxCategories([]))
      .finally(() => setLoadingTaxCategories(false));
  }, [activeCompanyId]);

  const loadAccounts = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingAccounts(true);
    fetch(`/api/coa?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => {
        const rows = (data.accounts ?? []).filter((account: Account) => account.isPosting);
        setAccounts(rows);
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [activeCompanyId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadTaxCategories();
    loadAccounts();
  }, [loadAccounts, loadTaxCategories]);

  useEffect(() => {
    if (type === "service") {
      setTrackInventory(false);
      setPackUnit("");
      setPackSize("");
      setMinStock("");
    }
  }, [type]);

  const generateBarcode = useCallback(() => {
    const random = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    setBarcode(random);
  }, []);

  useEffect(() => {
    if (type === "product" && !barcode) {
      generateBarcode();
    }
  }, [type, generateBarcode]);

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }

    const packSizeValue = packSize.trim();
    const packSizeNumber = packSizeValue ? Number(packSizeValue) : null;
    if (packSizeValue && Number.isNaN(packSizeNumber)) {
      setErrorKey("items.packSizeInvalid");
      return;
    }

    const salePriceValue = salePrice.trim();
    const salePriceNumber = salePriceValue ? Number(salePriceValue) : null;
    if (salePriceValue && Number.isNaN(salePriceNumber)) {
      setErrorKey("items.salePriceInvalid");
      return;
    }

    const purchasePriceValue = purchasePrice.trim();
    const purchasePriceNumber = purchasePriceValue ? Number(purchasePriceValue) : null;
    if (purchasePriceValue && Number.isNaN(purchasePriceNumber)) {
      setErrorKey("items.purchasePriceInvalid");
      return;
    }

    const minStockValue = minStock.trim();
    const minStockNumber = minStockValue ? Number(minStockValue) : null;
    if (minStockValue && Number.isNaN(minStockNumber)) {
      setErrorKey("items.minStockInvalid");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          type,
          name,
          sku: sku || null,
          barcode: barcode || null,
          category: category || null,
          brand: brand || null,
          descriptionAr: descriptionAr || null,
          descriptionEn: descriptionEn || null,
          baseUnit,
          packUnit: packUnit || null,
          packSize: packSizeNumber,
          salePrice: salePriceNumber,
          purchasePrice: purchasePriceNumber,
          taxCategoryId: taxCategoryId || null,
          incomeAccountId: incomeAccountId || null,
          expenseAccountId: expenseAccountId || null,
          trackInventory: type === "service" ? false : trackInventory,
          minStock: type === "service" ? null : minStockNumber,
          status,
          tags: formatTags(tags),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Duplicate item") {
          setErrorKey("items.duplicate");
        } else if (data?.error === "Invalid payload") {
          setErrorKey("items.invalidPayload");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }

      setType("product");
      setName("");
      setSku("");
      setBarcode("");
      setCategory("");
      setBrand("");
      setBaseUnit("");
      setPackUnit("");
      setPackSize("");
      setSalePrice("");
      setPurchasePrice("");
      setTaxCategoryId("");
      setIncomeAccountId("");
      setExpenseAccountId("");
      setTrackInventory(false);
      setMinStock("");
      setStatus("active");
      setDescriptionAr("");
      setDescriptionEn("");
      setTags("");
      loadItems();
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((item) => item.id));
    }
  };

  const handleBulkStatus = () => {
    if (!activeCompanyId || selectedIds.length === 0) {
      return;
    }
    startTransition(async () => {
      await fetch("/api/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          ids: selectedIds,
          status: bulkStatus,
        }),
      });
      setSelectedIds([]);
      loadItems();
    });
  };

  const handleImport = () => {
    if (!activeCompanyId || !importFile) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setImportSummary(null);
      const csv = await importFile.text();
      const response = await fetch("/api/items/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, csv }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setImportSummary({
        created: data.created ?? 0,
        errors: data.errors ?? [],
      });
      setImportFile(null);
      loadItems();
    });
  };

  const handleExport = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/items/export?companyId=${activeCompanyId}`);
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "items.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleDownloadTemplate = () => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/items/import?companyId=${activeCompanyId}&lang=${locale}`
      );
      if (!response.ok) {
        setErrorKey("error.loadFailed");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        locale === "ar" ? "items-template-ar.csv" : "items-template-en.csv";
      anchor.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("items.title")}</h1>
          <p className="text-sm text-muted">{t("items.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("common.export")}
          </button>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending}
          >
            {t("common.downloadTemplate")}
          </button>
          <label className="text-xs text-muted">
            <input
              type="file"
              accept="text/csv"
              className="block w-full text-xs"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleImport}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-muted"
            disabled={isPending || !importFile}
          >
            {t("common.import")}
          </button>
        </div>
      </div>
      <details className="app-panel px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer text-xs font-semibold text-foreground">
          {t("items.importHintTitle")}
        </summary>
        <p className="mt-2 text-xs text-muted">{t("items.importHint")}</p>
      </details>

      <div className="app-card p-4">
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("items.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.typeFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="product">{t("items.type.product")}</option>
              <option value="service">{t("items.type.service")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.statusFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.inventoryFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={inventoryFilter}
              onChange={(event) => setInventoryFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="tracked">{t("items.inventoryTracked")}</option>
              <option value="untracked">{t("items.inventoryUntracked")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.lowStockFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={lowStockFilter}
              onChange={(event) => setLowStockFilter(event.target.value)}
            >
              <option value="all">{t("common.all")}</option>
              <option value="low">{t("items.lowStockOnly")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.taxFilter")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={taxCategoryFilter}
              onChange={(event) => setTaxCategoryFilter(event.target.value)}
              disabled={loadingTaxCategories}
            >
              <option value="all">{t("common.all")}</option>
              <option value="none">{t("items.taxNone")}</option>
              {taxCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.rate}%)
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.categoryFilter")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              placeholder={t("items.categoryPlaceholder")}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">{t("items.bulkStatus")}</span>
          <select
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            value={bulkStatus}
            onChange={(event) =>
              setBulkStatus(event.target.value as "active" | "inactive")
            }
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkStatus}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            disabled={isPending || selectedIds.length === 0}
          >
            {t("common.apply")}
          </button>
        </div>
      </div>

      <form onSubmit={handleCreate} className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("items.addTitle")}</h2>
          <span className="text-xs text-muted">{t("common.optional")}</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.type")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value as "product" | "service")}
            >
              <option value="product">{t("items.type.product")}</option>
              <option value="service">{t("items.type.service")}</option>
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.sku")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="block text-xs text-muted">{t("items.barcode")}</span>
              <button
                type="button"
                onClick={generateBarcode}
                className="text-xs text-primary underline decoration-dotted hover:text-primary/80"
              >
                {t("common.generate")}
              </button>
            </div>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.category")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.brand")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={brand}
              onChange={(event) => setBrand(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.baseUnit")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={baseUnit}
              onChange={(event) => setBaseUnit(event.target.value)}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.packUnit")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={packUnit}
              onChange={(event) => setPackUnit(event.target.value)}
              disabled={type === "service"}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.packSize")}</span>
            <input
              type="number"
              min="1"
              step="1"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={packSize}
              onChange={(event) => setPackSize(event.target.value)}
              disabled={type === "service"}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.salePrice")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={salePrice}
              onChange={(event) => setSalePrice(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.purchasePrice")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={purchasePrice}
              onChange={(event) => setPurchasePrice(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.taxCategory")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={taxCategoryId}
              onChange={(event) => setTaxCategoryId(event.target.value)}
              disabled={loadingTaxCategories}
            >
              <option value="">{t("common.none")}</option>
              {taxCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.rate}%)
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.incomeAccount")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={incomeAccountId}
              onChange={(event) => setIncomeAccountId(event.target.value)}
              disabled={loadingAccounts}
            >
              <option value="">{t("common.none")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.expenseAccount")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={expenseAccountId}
              onChange={(event) => setExpenseAccountId(event.target.value)}
              disabled={loadingAccounts}
            >
              <option value="">{t("common.none")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
            <select
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trackInventory}
              onChange={(event) => setTrackInventory(event.target.checked)}
              disabled={type === "service"}
            />
            {t("items.trackInventory")}
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.minStock")}</span>
            <input
              type="number"
              min="0"
              step="1"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
              disabled={!trackInventory || type === "service"}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.descriptionAr")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={descriptionAr}
              onChange={(event) => setDescriptionAr(event.target.value)}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("items.descriptionEn")}</span>
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={descriptionEn}
              onChange={(event) => setDescriptionEn(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.tags")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("items.tagsHint")}
            />
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("common.add")}
        </button>
      </form>

      {importSummary ? (
        <div className="app-panel p-4 text-sm">
          <p>{t("items.importSummary", { count: String(importSummary.created) })}</p>
          {importSummary.errors.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-semibold">{t("items.importErrors")}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {importSummary.errors.map((error) => (
                  <li key={`${error.row}-${error.code ?? error.message ?? "error"}`}>
                    #{error.row}{" "}
                    {formatImportField(error.field)
                      ? `- ${formatImportField(error.field)}: `
                      : "- "}
                    {formatImportError(error)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="app-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold">
          <span>{t("items.listTitle")}</span>
          <span className="text-xs text-muted">
            {loadingItems ? "—" : items.length}
          </span>
        </div>
        {loadingItems ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-muted">{t("items.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted">
                <tr>
                  <th className={`px-4 py-2 ${alignClass}`}>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("items.name")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("items.type")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("items.sku")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("items.stockOnHand")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.status")}</th>
                  <th className={`px-4 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const isLowStock =
                    item.trackInventory &&
                    item.minStock !== null &&
                    item.minStock !== undefined &&
                    item.stockOnHand <= item.minStock;
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <p className="font-semibold">
                          <Link
                            href={`/items/${item.id}`}
                            className="text-primary underline decoration-dotted"
                          >
                            {item.name}
                          </Link>
                        </p>
                        {item.category ? (
                          <p className="text-xs text-muted">{item.category}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2">
                        {item.type === "product"
                          ? t("items.type.product")
                          : t("items.type.service")}
                      </td>
                      <td className="px-4 py-2">{item.sku ?? "-"}</td>
                      <td className="px-4 py-2">
                        {item.trackInventory ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span>
                              {item.stockOnHand} {item.baseUnit}
                            </span>
                            {isLowStock ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                                {t("items.lowStockLabel")}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {t(`status.${item.status ?? "active"}`)}
                      </td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/items/${item.id}`}
                          className="text-xs font-semibold text-foreground underline decoration-dotted"
                        >
                          {t("common.edit")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
