"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useCompany } from "@/components/company-provider";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";
import { SkeletonBlock } from "@/components/skeleton";

type DocumentVersion = {
  id: string;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string | null;
  content?: string | null;
  replacedAt: string;
  replacedBy?: string | null;
};

type DocumentRecord = {
  id: string;
  companyId: string;
  name: string;
  docType: "invoice" | "receipt" | "contract" | "id" | "general";
  tags: string[];
  entityType?: string | null;
  entityId?: string | null;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string | null;
  content?: string | null;
  uploadedByEmail?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  versions?: DocumentVersion[];
};

type UploadForm = {
  name: string;
  docType: DocumentRecord["docType"];
  tags: string;
  entityType: string;
  entityId: string;
};

type EditForm = UploadForm;

const FIRESTORE_ATTACHMENT_LIMIT = 700 * 1024;

const DOC_TYPES: Array<{ value: DocumentRecord["docType"]; labelKey: string }> = [
  { value: "general", labelKey: "documents.type.general" },
  { value: "invoice", labelKey: "documents.type.invoice" },
  { value: "receipt", labelKey: "documents.type.receipt" },
  { value: "contract", labelKey: "documents.type.contract" },
  { value: "id", labelKey: "documents.type.id" },
];

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

const formatTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function DocumentsPage() {
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [filters, setFilters] = useState({
    q: "",
    docType: "all",
    entityType: "all",
    tag: "",
  });
  const [form, setForm] = useState<UploadForm>({
    name: "",
    docType: "general",
    tags: "",
    entityType: "",
    entityId: "",
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [replaceFiles, setReplaceFiles] = useState<Record<string, File | null>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-";
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

  const docTypeOptions = useMemo(
    () =>
      DOC_TYPES.map((type) => ({
        value: type.value,
        label: t(type.labelKey),
      })),
    [t]
  );

  const loadDocuments = useCallback(async () => {
    if (!activeCompanyId) {
      return;
    }
    setErrorKey(null);
    setLoadingDocuments(true);
    const params = new URLSearchParams({ companyId: activeCompanyId });
    if (filters.q.trim()) {
      params.set("q", filters.q.trim());
    }
    if (filters.docType !== "all") {
      params.set("docType", filters.docType);
    }
    if (filters.entityType !== "all" && filters.entityType.trim()) {
      params.set("entityType", filters.entityType.trim());
    }
    if (filters.tag.trim()) {
      params.set("tag", filters.tag.trim());
    }
    const response = await fetch(`/api/documents?${params.toString()}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setDocuments([]);
      setLoadingDocuments(false);
      return;
    }
    const data = await response.json();
    setDocuments(data.documents ?? []);
    setLoadingDocuments(false);
  }, [activeCompanyId, filters]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const resetEditState = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleUpload = () => {
    if (!activeCompanyId || !uploadFile || !form.name.trim()) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      setIsUploading(true);
      try {
        const payload: {
          companyId: string;
          name: string;
          docType: DocumentRecord["docType"];
          tags: string[];
          entityType?: string | null;
          entityId?: string | null;
          contentType: string;
          size: number;
          storage: "cloudinary" | "firestore";
          url?: string | null;
          content?: string | null;
        } = {
          companyId: activeCompanyId,
          name: form.name.trim(),
          docType: form.docType,
          tags: formatTags(form.tags),
          entityType: form.entityType.trim() ? form.entityType.trim() : null,
          entityId: form.entityId.trim() ? form.entityId.trim() : null,
          contentType: uploadFile.type || "application/octet-stream",
          size: uploadFile.size,
          storage: "firestore",
        };

        if (isCloudinaryFile(uploadFile)) {
          const url = await uploadToCloudinary(
            uploadFile,
            `companies/${activeCompanyId}/documents`
          );
          payload.storage = "cloudinary";
          payload.url = url;
        } else {
          if (uploadFile.size > FIRESTORE_ATTACHMENT_LIMIT) {
            setErrorKey("documents.attachmentTooLarge");
            return;
          }
          const content = await readFileAsDataUrl(uploadFile);
          payload.storage = "firestore";
          payload.content = content;
        }

        const response = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.error === "Attachment too large") {
            setErrorKey("documents.attachmentTooLarge");
          } else {
            setErrorKey("documents.uploadFailed");
          }
          return;
        }

        setForm({ name: "", docType: "general", tags: "", entityType: "", entityId: "" });
        setUploadFile(null);
        setNoticeKey("documents.uploadSuccess");
        await loadDocuments();
      } catch {
        setErrorKey("documents.uploadFailed");
      } finally {
        setIsUploading(false);
      }
    });
  };

  const handleEdit = (document: DocumentRecord) => {
    setEditingId(document.id);
    setEditForm({
      name: document.name ?? "",
      docType: document.docType ?? "general",
      tags: Array.isArray(document.tags) ? document.tags.join(", ") : "",
      entityType: document.entityType ?? "",
      entityId: document.entityId ?? "",
    });
  };

  const handleUpdateMetadata = async (documentId: string) => {
    if (!editForm) {
      return;
    }
    setErrorKey(null);
    setNoticeKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          docType: editForm.docType,
          tags: formatTags(editForm.tags),
          entityType: editForm.entityType.trim() || null,
          entityId: editForm.entityId.trim() || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      resetEditState();
      setNoticeKey("documents.updateSuccess");
      await loadDocuments();
    });
  };

  const handleReplace = (documentId: string) => {
    if (!activeCompanyId) {
      return;
    }
    const file = replaceFiles[documentId];
    if (!file) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      setIsUploading(true);
      try {
        const payload: {
          companyId: string;
          contentType: string;
          size: number;
          storage: "cloudinary" | "firestore";
          url?: string | null;
          content?: string | null;
        } = {
          companyId: activeCompanyId,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          storage: "firestore",
        };

        if (isCloudinaryFile(file)) {
          const url = await uploadToCloudinary(
            file,
            `companies/${activeCompanyId}/documents`
          );
          payload.storage = "cloudinary";
          payload.url = url;
        } else {
          if (file.size > FIRESTORE_ATTACHMENT_LIMIT) {
            setErrorKey("documents.attachmentTooLarge");
            return;
          }
          const content = await readFileAsDataUrl(file);
          payload.storage = "firestore";
          payload.content = content;
        }

        const response = await fetch(`/api/documents/${documentId}/replace`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.error === "Attachment too large") {
            setErrorKey("documents.attachmentTooLarge");
          } else {
            setErrorKey("documents.replaceFailed");
          }
          return;
        }
        setReplaceFiles((prev) => ({ ...prev, [documentId]: null }));
        setNoticeKey("documents.replaceSuccess");
        await loadDocuments();
      } catch {
        setErrorKey("documents.replaceFailed");
      } finally {
        setIsUploading(false);
      }
    });
  };

  const handleDelete = (documentId: string) => {
    const confirmed = window.confirm(t("documents.deleteConfirm"));
    if (!confirmed) {
      return;
    }
    startTransition(async () => {
      setErrorKey(null);
      setNoticeKey(null);
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setNoticeKey("documents.deleteSuccess");
      await loadDocuments();
    });
  };

  return (
    <section className="space-y-6 page-shell">
      <div>
        <h1 className="text-2xl font-semibold page-title">{t("documents.title")}</h1>
        <p className="text-sm text-muted page-subtitle">{t("documents.subtitle")}</p>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("documents.filtersTitle")}</h2>
          <button
            type="button"
            onClick={loadDocuments}
            className="rounded-2xl border border-border px-3 py-2 text-xs font-semibold"
            disabled={isPending}
          >
            {t("documents.applyFilters")}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.search")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder={t("documents.searchPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.type")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filters.docType}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, docType: event.target.value }))
              }
            >
              <option value="all">{t("common.all")}</option>
              {docTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.entityType")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filters.entityType === "all" ? "" : filters.entityType}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  entityType: event.target.value || "all",
                }))
              }
              placeholder={t("documents.entityTypePlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.tag")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={filters.tag}
              onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))}
              placeholder={t("documents.tagPlaceholder")}
            />
          </label>
        </div>
      </div>

      <div className="app-card p-6 card-modern">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("documents.uploadTitle")}</h2>
          <p className="text-xs text-muted">{t("documents.attachmentHint")}</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.name")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.type")}</span>
            <select
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.docType}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  docType: event.target.value as DocumentRecord["docType"],
                }))
              }
            >
              {docTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.tags")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.tags}
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder={t("documents.tagsHint")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.entityType")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.entityType}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, entityType: event.target.value }))
              }
              placeholder={t("documents.entityTypePlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.entityId")}</span>
            <input
              className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
              value={form.entityId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, entityId: event.target.value }))
              }
              placeholder={t("documents.entityIdPlaceholder")}
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("documents.file")}</span>
            <input
              type="file"
              className="block w-full text-xs"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {errorKey ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {noticeKey ? (
          <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t(noticeKey)}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleUpload}
          className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast"
          disabled={isPending || isUploading || !uploadFile || !form.name.trim()}
        >
          {isUploading ? t("documents.uploading") : t("documents.upload")}
        </button>
      </div>

      <div className="app-card overflow-hidden card-modern">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">{t("documents.listTitle")}</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">
              {loadingDocuments ? "—" : documents.length}
            </span>
            <a
              href={
                activeCompanyId
                  ? `/api/documents/export?companyId=${activeCompanyId}`
                  : "#"
              }
              className={`rounded-2xl border border-border px-3 py-2 text-xs font-semibold ${
                activeCompanyId ? "" : "pointer-events-none opacity-60"
              }`}
            >
              {t("documents.exportCsv")}
            </a>
          </div>
        </div>
        {loadingDocuments ? (
          <div className="space-y-3 px-4 py-6">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-10 w-full" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted">{t("documents.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm table-modern">
              <thead className="bg-surface-muted text-xs text-muted thead-modern">
                <tr>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("documents.name")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("documents.type")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("documents.entity")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("documents.storage")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("documents.updatedAt")}</th>
                  <th className={`px-3 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="px-3 py-2">
                      <p className="font-semibold">{document.name}</p>
                      <p className="text-xs text-muted">{formatFileSize(document.size)}</p>
                      {document.tags?.length ? (
                        <p className="text-xs text-muted">
                          {document.tags.map((tag) => `#${tag}`).join(" ")}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {t(`documents.type.${document.docType}`)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p>{document.entityType ?? "-"}</p>
                      <p className="text-muted">{document.entityId ?? ""}</p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {document.storage === "cloudinary"
                        ? t("documents.storage.cloudinary")
                        : t("documents.storage.firestore")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <p>{formatDate(document.updatedAt ?? document.createdAt)}</p>
                      <p className="text-muted">{document.uploadedByEmail ?? "-"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {document.storage === "cloudinary" && document.url ? (
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary"
                          >
                            {t("common.view")}
                          </a>
                        ) : null}
                        {document.storage === "firestore" && document.content ? (
                          <a
                            href={document.content}
                            download={document.name}
                            className="font-semibold text-primary"
                          >
                            {t("common.download")}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleEdit(document)}
                          className="font-semibold text-primary"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(document.id)}
                          className="font-semibold text-red-500"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                      {editingId === document.id && editForm ? (
                        <div className="mt-4 rounded-2xl border border-border bg-surface px-3 py-3 text-xs">
                          <div className="grid gap-3 md:grid-cols-4">
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">
                                {t("documents.name")}
                              </span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.name}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, name: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">
                                {t("documents.type")}
                              </span>
                              <select
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.docType}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          docType: event.target.value as DocumentRecord["docType"],
                                        }
                                      : prev
                                  )
                                }
                              >
                                {docTypeOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">
                                {t("documents.tags")}
                              </span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.tags}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, tags: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">
                                {t("documents.entityType")}
                              </span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.entityType}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, entityType: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                            <label className={`text-xs ${alignClass}`}>
                              <span className="mb-1 block text-[11px] text-muted">
                                {t("documents.entityId")}
                              </span>
                              <input
                                className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                                value={editForm.entityId}
                                onChange={(event) =>
                                  setEditForm((prev) =>
                                    prev ? { ...prev, entityId: event.target.value } : prev
                                  )
                                }
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateMetadata(document.id)}
                              className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-contrast"
                              disabled={isPending}
                            >
                              {t("documents.save")}
                            </button>
                            <button
                              type="button"
                              onClick={resetEditState}
                              className="rounded-lg border border-border px-3 py-1 text-xs font-semibold"
                            >
                              {t("documents.cancel")}
                            </button>
                          </div>
                          <div className="mt-4 border-t border-border pt-3">
                            <p className="text-[11px] font-semibold text-muted">
                              {t("documents.replaceTitle")}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <input
                                type="file"
                                className="block text-xs"
                                onChange={(event) =>
                                  setReplaceFiles((prev) => ({
                                    ...prev,
                                    [document.id]: event.target.files?.[0] ?? null,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                onClick={() => handleReplace(document.id)}
                                className="rounded-lg border border-border px-3 py-1 text-xs font-semibold"
                                disabled={isPending || isUploading || !replaceFiles[document.id]}
                              >
                                {t("documents.replace")}
                              </button>
                            </div>
                            <p className="mt-2 text-[11px] text-muted">
                              {t("documents.replaceHint")}
                            </p>
                          </div>
                          {document.versions?.length ? (
                            <div className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2">
                              <p className="text-[11px] font-semibold text-muted">
                                {t("documents.versionHistory")}
                              </p>
                              <div className="mt-2 space-y-1 text-[11px] text-muted">
                                {document.versions.map((version) => (
                                  <div
                                    key={version.id}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <span>{formatDate(version.replacedAt)}</span>
                                    <span>{formatFileSize(version.size)}</span>
                                    <span>
                                      {version.storage === "cloudinary"
                                        ? t("documents.storage.cloudinary")
                                        : t("documents.storage.firestore")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
