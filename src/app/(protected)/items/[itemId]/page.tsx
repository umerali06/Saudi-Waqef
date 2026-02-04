"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { getUnitOptions } from "@/lib/utils/units";

type Item = {
  id: string;
  companyId: string;
  type: "product" | "service";
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  brand?: string;
  descriptionAr?: string;
  descriptionEn?: string;
  baseUnit: string;
  packUnit?: string | null;
  packSize?: number | null;
  salePrice?: number | null;
  purchasePrice?: number | null;
  taxCategoryId?: string | null;
  incomeAccountId?: string | null;
  expenseAccountId?: string | null;
  trackInventory: boolean;
  minStock?: number | null;
  stockOnHand: number;
  stockReserved: number;
  status: "active" | "inactive";
  tags: string[];
};

type Attachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string;
  content?: string;
  createdAt: string;
};

type Adjustment = {
  id: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  reason: "opening" | "damage" | "count" | "other";
  note?: string;
  createdAt: string;
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

type ItemFormState = {
  type: "product" | "service";
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  baseUnit: string;
  packUnit: string;
  packSize: string;
  salePrice: string;
  purchasePrice: string;
  taxCategoryId: string;
  incomeAccountId: string;
  expenseAccountId: string;
  trackInventory: boolean;
  minStock: string;
  status: "active" | "inactive";
  descriptionAr: string;
  descriptionEn: string;
  tags: string;
};

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const formatTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const isCloudinaryFile = (file: File) =>
  file.type.startsWith("image/") ||
  file.type.startsWith("video/") ||
  file.type === "application/pdf";

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });

export default function ItemDetailPage() {
  const params = useParams<{ itemId: string }>();
  const itemId = params.itemId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [item, setItem] = useState<Item | null>(null);
  const [form, setForm] = useState<ItemFormState | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [taxCategories, setTaxCategories] = useState<TaxCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingItem, setLoadingItem] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [loadingAdjustments, setLoadingAdjustments] = useState(false);
  const [loadingTaxCategories, setLoadingTaxCategories] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState("");
  const [adjustmentUnit, setAdjustmentUnit] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState<
    "opening" | "damage" | "count" | "other"
  >("count");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const packSizeValue = form?.packSize ? Number(form.packSize) : null;
  const hasUnitConversion =
    form &&
    form.packUnit &&
    form.baseUnit &&
    packSizeValue !== null &&
    Number.isFinite(packSizeValue) &&
    packSizeValue > 0;

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const unitOptions = useMemo(() => {
    if (!item) {
      return [];
    }
    return getUnitOptions({
      baseUnit: item.baseUnit,
      packUnit: item.packUnit,
      packSize: item.packSize,
    });
  }, [item]);

  const formatDate = (value?: string) => {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const loadItem = useCallback(async () => {
    setLoadingItem(true);
    const response = await fetch(`/api/items/${itemId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingItem(false);
      return;
    }
    const data = await response.json();
    const nextItem = data.item as Item | undefined;
    setItem(nextItem ?? null);
    if (nextItem) {
      setForm({
        type: nextItem.type,
        name: nextItem.name ?? "",
        sku: nextItem.sku ?? "",
        barcode: nextItem.barcode ?? "",
        category: nextItem.category ?? "",
        brand: nextItem.brand ?? "",
        baseUnit: nextItem.baseUnit ?? "",
        packUnit: nextItem.packUnit ?? "",
        packSize: nextItem.packSize ? String(nextItem.packSize) : "",
        salePrice:
          nextItem.salePrice !== null && nextItem.salePrice !== undefined
            ? String(nextItem.salePrice)
            : "",
        purchasePrice:
          nextItem.purchasePrice !== null && nextItem.purchasePrice !== undefined
            ? String(nextItem.purchasePrice)
            : "",
        taxCategoryId: nextItem.taxCategoryId ?? "",
        incomeAccountId: nextItem.incomeAccountId ?? "",
        expenseAccountId: nextItem.expenseAccountId ?? "",
        trackInventory: nextItem.trackInventory ?? false,
        minStock:
          nextItem.minStock !== null && nextItem.minStock !== undefined
            ? String(nextItem.minStock)
            : "",
        status: nextItem.status ?? "active",
        descriptionAr: nextItem.descriptionAr ?? "",
        descriptionEn: nextItem.descriptionEn ?? "",
        tags: Array.isArray(nextItem.tags) ? nextItem.tags.join(", ") : "",
      });
      setAdjustmentUnit(nextItem.baseUnit ?? "");
    }
    setLoadingItem(false);
  }, [itemId]);

  const loadAttachments = useCallback(async () => {
    setLoadingAttachments(true);
    const response = await fetch(`/api/items/${itemId}/attachments`);
    if (!response.ok) {
      setAttachments([]);
      setLoadingAttachments(false);
      return;
    }
    const data = await response.json();
    setAttachments(data.attachments ?? []);
    setLoadingAttachments(false);
  }, [itemId]);

  const loadAdjustments = useCallback(async () => {
    setLoadingAdjustments(true);
    const response = await fetch(`/api/items/${itemId}/adjustments`);
    if (!response.ok) {
      setAdjustments([]);
      setLoadingAdjustments(false);
      return;
    }
    const data = await response.json();
    setAdjustments(data.adjustments ?? []);
    setLoadingAdjustments(false);
  }, [itemId]);

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
    loadItem();
    loadAttachments();
    loadAdjustments();
  }, [loadAdjustments, loadAttachments, loadItem]);

  useEffect(() => {
    loadTaxCategories();
    loadAccounts();
  }, [loadAccounts, loadTaxCategories]);

  useEffect(() => {
    if (form?.type === "service") {
      setForm((prev) =>
        prev
          ? {
              ...prev,
              trackInventory: false,
              packUnit: "",
              packSize: "",
              minStock: "",
            }
          : prev
      );
    }
  }, [form?.type]);

  const generateBarcode = useCallback(() => {
    const random = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    setForm((prev) => (prev ? { ...prev, barcode: random } : prev));
  }, []);

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !form) {
      return;
    }

    const packSizeValue = form.packSize.trim();
    const packSizeNumber = packSizeValue ? Number(packSizeValue) : null;
    if (packSizeValue && Number.isNaN(packSizeNumber)) {
      setErrorKey("items.packSizeInvalid");
      return;
    }

    const salePriceValue = form.salePrice.trim();
    const salePriceNumber = salePriceValue ? Number(salePriceValue) : null;
    if (salePriceValue && Number.isNaN(salePriceNumber)) {
      setErrorKey("items.salePriceInvalid");
      return;
    }

    const purchasePriceValue = form.purchasePrice.trim();
    const purchasePriceNumber = purchasePriceValue ? Number(purchasePriceValue) : null;
    if (purchasePriceValue && Number.isNaN(purchasePriceNumber)) {
      setErrorKey("items.purchasePriceInvalid");
      return;
    }

    const minStockValue = form.minStock.trim();
    const minStockNumber = minStockValue ? Number(minStockValue) : null;
    if (minStockValue && Number.isNaN(minStockNumber)) {
      setErrorKey("items.minStockInvalid");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          type: form.type,
          name: form.name,
          sku: form.sku || null,
          barcode: form.barcode || null,
          category: form.category || null,
          brand: form.brand || null,
          descriptionAr: form.descriptionAr || null,
          descriptionEn: form.descriptionEn || null,
          baseUnit: form.baseUnit,
          packUnit: form.packUnit || null,
          packSize: packSizeNumber,
          salePrice: salePriceNumber,
          purchasePrice: purchasePriceNumber,
          taxCategoryId: form.taxCategoryId || null,
          incomeAccountId: form.incomeAccountId || null,
          expenseAccountId: form.expenseAccountId || null,
          trackInventory: form.type === "service" ? false : form.trackInventory,
          minStock: form.type === "service" ? null : minStockNumber,
          status: form.status,
          tags: formatTags(form.tags),
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
      await loadItem();
    });
  };

  const handleUploadAttachment = () => {
    if (!activeCompanyId || !attachmentFile || !item) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setIsUploading(true);
      try {
        const payload: {
          companyId: string;
          name: string;
          contentType: string;
          size: number;
          storage: "cloudinary" | "firestore";
          url?: string | null;
          content?: string | null;
        } = {
          companyId: activeCompanyId,
          name: attachmentFile.name,
          contentType: attachmentFile.type || "application/octet-stream",
          size: attachmentFile.size,
          storage: "firestore",
        };

        if (isCloudinaryFile(attachmentFile)) {
          const url = await uploadToCloudinary(
            attachmentFile,
            `companies/${activeCompanyId}/items/${itemId}`
          );
          payload.storage = "cloudinary";
          payload.url = url;
        } else {
          if (attachmentFile.size > FIRESTORE_ATTACHMENT_LIMIT) {
            setErrorKey("items.attachmentTooLarge");
            return;
          }
          const content = await readFileAsDataUrl(attachmentFile);
          payload.storage = "firestore";
          payload.content = content;
        }

        const response = await fetch(`/api/items/${itemId}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.error === "Attachment too large") {
            setErrorKey("items.attachmentTooLarge");
          } else {
            setErrorKey("items.attachmentUploadFailed");
          }
          return;
        }
        setAttachmentFile(null);
        loadAttachments();
      } catch {
        setErrorKey("items.attachmentUploadFailed");
      } finally {
        setIsUploading(false);
      }
    });
  };

  const handleDeleteAttachment = (attachmentId: string) => {
    startTransition(async () => {
      await fetch(`/api/items/${itemId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      loadAttachments();
    });
  };

  const handleAdjustment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !item) {
      return;
    }
    const quantityValue = adjustmentQty.trim();
    const quantity = quantityValue ? Number(quantityValue) : NaN;
    if (Number.isNaN(quantity)) {
      setErrorKey("items.adjustmentInvalid");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/items/${itemId}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          quantity,
          unit: adjustmentUnit,
          reason: adjustmentReason,
          note: adjustmentNote || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Inventory not tracked") {
          setErrorKey("items.inventoryNotTracked");
        } else if (data?.error === "Invalid unit") {
          setErrorKey("items.invalidUnit");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      setAdjustmentQty("");
      setAdjustmentReason("count");
      setAdjustmentNote("");
      loadItem();
      loadAdjustments();
    });
  };

  if (loadingItem && !item && !errorKey) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="app-card space-y-4 p-5">
          <SkeletonBlock className="h-5 w-40" />
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card space-y-3 p-5">
            <SkeletonBlock className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-4 w-full" />
            ))}
          </div>
          <div className="app-card space-y-3 p-5 lg:col-span-2">
            <SkeletonBlock className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="app-card space-y-3 p-5">
          <SkeletonBlock className="h-5 w-40" />
          {Array.from({ length: 4 }).map((_, idx) => (
            <SkeletonBlock key={idx} className="h-10 w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("items.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold">{item?.name ?? "-"}</h1>
          {item?.sku ? <p className="text-sm text-muted">{item.sku}</p> : null}
        </div>
        <Link
          href="/items"
          className="text-xs font-semibold text-muted underline decoration-dotted"
        >
          {t("items.title")}
        </Link>
      </div>

      <form onSubmit={handleUpdate} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("items.detailsSection")}</h2>
        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.type")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.type}
                onChange={(event) =>
                  setForm((prev) =>
                    prev
                      ? { ...prev, type: event.target.value as "product" | "service" }
                      : prev
                  )
                }
              >
                <option value="product">{t("items.type.product")}</option>
                <option value="service">{t("items.type.service")}</option>
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.name")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.sku")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.sku}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, sku: event.target.value } : prev))
                }
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
                value={form.barcode}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, barcode: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.category")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.category}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, category: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.brand")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.brand}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, brand: event.target.value } : prev))
                }
              />
            </label>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>
        )}

        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.baseUnit")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.baseUnit}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, baseUnit: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.packUnit")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.packUnit}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, packUnit: event.target.value } : prev
                  )
                }
                disabled={form.type === "service"}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.packSize")}</span>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.packSize}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, packSize: event.target.value } : prev
                  )
                }
                disabled={form.type === "service"}
              />
            </label>
          </div>
        ) : null}

        {form ? (
          <div className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-foreground">
              {t("items.unitConversion")}:
            </span>{" "}
            {hasUnitConversion
              ? t("items.unitConversionDetail", {
                  packUnit: form.packUnit,
                  packSize: String(packSizeValue),
                  baseUnit: form.baseUnit,
                })
              : t("items.noPackUnit")}
          </div>
        ) : null}

        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.salePrice")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.salePrice}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, salePrice: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.purchasePrice")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.purchasePrice}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, purchasePrice: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.taxCategory")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.taxCategoryId}
              onChange={(event) =>
                setForm((prev) =>
                  prev ? { ...prev, taxCategoryId: event.target.value } : prev
                )
              }
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
        ) : null}

        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.incomeAccount")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.incomeAccountId}
              onChange={(event) =>
                setForm((prev) =>
                  prev ? { ...prev, incomeAccountId: event.target.value } : prev
                )
              }
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
              value={form.expenseAccountId}
              onChange={(event) =>
                setForm((prev) =>
                  prev ? { ...prev, expenseAccountId: event.target.value } : prev
                )
              }
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
                value={form.status}
                onChange={(event) =>
                  setForm((prev) =>
                    prev
                      ? { ...prev, status: event.target.value as "active" | "inactive" }
                      : prev
                  )
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {form ? (
          <div className="mt-4 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.trackInventory}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, trackInventory: event.target.checked } : prev
                  )
                }
                disabled={form.type === "service"}
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
                value={form.minStock}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, minStock: event.target.value } : prev
                  )
                }
                disabled={!form.trackInventory || form.type === "service"}
              />
            </label>
          </div>
        ) : null}

        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.descriptionAr")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.descriptionAr}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, descriptionAr: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("items.descriptionEn")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.descriptionEn}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, descriptionEn: event.target.value } : prev
                  )
                }
              />
            </label>
          </div>
        ) : null}

        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.tags")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={form.tags}
                onChange={(event) =>
                  setForm((prev) => (prev ? { ...prev, tags: event.target.value } : prev))
                }
                placeholder={t("items.tagsHint")}
              />
            </label>
          </div>
        ) : null}
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
          {t("common.save")}
        </button>
      </form>

      {item?.trackInventory ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="app-card p-5">
            <h2 className="text-lg font-semibold">{t("items.inventorySummary")}</h2>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("items.stockOnHand")}</span>
                <span>
                  {item.stockOnHand} {item.baseUnit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("items.stockReserved")}</span>
                <span>
                  {item.stockReserved} {item.baseUnit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("items.stockAvailable")}</span>
                <span>
                  {item.stockOnHand - item.stockReserved} {item.baseUnit}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t("items.minStock")}</span>
                <span>{item.minStock ?? 0}</span>
              </div>
            </div>
          </div>
          <div className="app-card p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("items.adjustmentsTitle")}</h2>
              <span className="text-xs text-muted">
                {loadingAdjustments ? "—" : adjustments.length}
              </span>
            </div>
            <form onSubmit={handleAdjustment} className="mt-4 grid gap-4 md:grid-cols-4">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("items.adjustmentQuantity")}</span>
                <input
                  type="number"
                  step="0.01"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={adjustmentQty}
                  onChange={(event) => setAdjustmentQty(event.target.value)}
                  required
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("items.adjustmentUnit")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={adjustmentUnit}
                  onChange={(event) => setAdjustmentUnit(event.target.value)}
                >
                  {unitOptions.map((option) => (
                    <option key={option.unit} value={option.unit}>
                      {option.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("items.adjustmentReason")}</span>
                <select
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={adjustmentReason}
                  onChange={(event) =>
                    setAdjustmentReason(
                      event.target.value as "opening" | "damage" | "count" | "other"
                    )
                  }
                >
                  <option value="opening">{t("items.reason.opening")}</option>
                  <option value="damage">{t("items.reason.damage")}</option>
                  <option value="count">{t("items.reason.count")}</option>
                  <option value="other">{t("items.reason.other")}</option>
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("items.adjustmentNote")}</span>
                <input
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  value={adjustmentNote}
                  onChange={(event) => setAdjustmentNote(event.target.value)}
                />
              </label>
              <button
                type="submit"
                className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
                disabled={isPending}
              >
                {t("items.adjustmentAdd")}
              </button>
            </form>

            {loadingAdjustments ? (
              <div className="mt-4 space-y-3">
                <SkeletonBlock className="h-4 w-40" />
                {Array.from({ length: 4 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-8 w-full" />
                ))}
              </div>
            ) : adjustments.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("common.date")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("items.adjustmentQuantity")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("items.adjustmentReason")}</th>
                      <th className={`px-2 py-2 ${alignClass}`}>{t("items.adjustmentNote")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {adjustments.map((adjustment) => (
                      <tr key={adjustment.id}>
                        <td className="px-2 py-2">{formatDate(adjustment.createdAt)}</td>
                        <td className="px-2 py-2">
                          {adjustment.quantity} {adjustment.unit}
                        </td>
                        <td className="px-2 py-2">
                          {t(`items.reason.${adjustment.reason}`)}
                        </td>
                        <td className="px-2 py-2">{adjustment.note ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">{t("items.adjustmentsEmpty")}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="app-panel p-4 text-sm text-muted">
          {t("items.inventoryNotTracked")}
        </div>
      )}

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("items.attachmentsTitle")}</h2>
          <span className="text-xs text-muted">
            {loadingAttachments ? "—" : attachments.length}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted">
            <input
              type="file"
              className="block w-full text-xs"
              onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={handleUploadAttachment}
            className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold"
            disabled={isPending || isUploading || !attachmentFile}
          >
            {isUploading ? t("items.uploading") : t("items.uploadAttachment")}
          </button>
          <p className="text-xs text-muted">{t("items.attachmentHint")}</p>
        </div>

        {loadingAttachments ? (
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-8 w-full" />
            ))}
          </div>
        ) : attachments.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("items.attachmentName")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("items.attachmentStorage")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.size")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attachments.map((attachment) => (
                  <tr key={attachment.id}>
                    <td className="px-2 py-2">
                      <p className="font-semibold">{attachment.name}</p>
                      <p className="text-xs text-muted">{attachment.contentType}</p>
                    </td>
                    <td className="px-2 py-2">
                      {attachment.storage === "cloudinary"
                        ? t("items.storage.cloudinary")
                        : t("items.storage.firestore")}
                    </td>
                    <td className="px-2 py-2">{formatFileSize(attachment.size)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {attachment.storage === "cloudinary" && attachment.url ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary"
                          >
                            {t("common.view")}
                          </a>
                        ) : null}
                        {attachment.storage === "firestore" && attachment.content ? (
                          <a
                            href={attachment.content}
                            download={attachment.name}
                            className="font-semibold text-primary"
                          >
                            {t("common.download")}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                          className="font-semibold text-red-500"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("items.attachmentsEmpty")}</p>
        )}
      </div>
    </section>
  );
}
