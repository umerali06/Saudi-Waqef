"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import type { AgingSummary } from "@/lib/data/open-items";

type Vendor = {
  id: string;
  companyId: string;
  name: string;
  legalName?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  crNumber?: string;
  email?: string;
  phone?: string;
  remittanceAddress?: string;
  paymentTermId?: string | null;
  preferredPaymentMethod?: string | null;
  currency?: string;
  notes?: string;
  tags: string[];
  status: "active" | "inactive";
};

type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary: boolean;
};

type OpenItem = {
  id: string;
  docType: string;
  docNumber: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  balance: number;
  currency: string;
};

type ActivityPayload = {
  items: OpenItem[];
  aging: AgingSummary;
};

type StatementBill = {
  billId: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  status: string;
  total: number;
  paid: number;
  credited: number;
  balance: number;
  currency: string;
};

type StatementPayload = {
  totals: {
    billed: number;
    paid: number;
    credited: number;
    balance: number;
  };
  aging?: AgingSummary | null;
  bills: StatementBill[];
  creditNotes: Array<{
    id: string;
    creditNumber: string;
    issueDate: string;
    total: number;
    status: string;
    currency: string;
  }>;
};

type StatementEmail = {
  id: string;
  to: string;
  subject: string;
  status: string;
  createdAt: string;
};

type PaymentTerm = {
  id: string;
  name: string;
  days: number;
};

type VendorFormState = {
  name: string;
  legalName: string;
  vatRegistered: boolean;
  vatNumber: string;
  crNumber: string;
  email: string;
  phone: string;
  remittanceAddress: string;
  paymentTermId: string;
  preferredPaymentMethod: string;
  currency: string;
  notes: string;
  tags: string;
  status: "active" | "inactive";
};

type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  role: string;
  isPrimary: boolean;
};

const formatTags = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export default function VendorDetailPage() {
  const params = useParams<{ vendorId: string }>();
  const vendorId = params.vendorId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loadingVendor, setLoadingVendor] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [sendingStatement, setSendingStatement] = useState(false);
  const [statement, setStatement] = useState<StatementPayload | null>(null);
  const [statementHistory, setStatementHistory] = useState<StatementEmail[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [form, setForm] = useState<VendorFormState | null>(null);
  const [contactForm, setContactForm] = useState<ContactFormState>({
    name: "",
    email: "",
    phone: "",
    role: "",
    isPrimary: false,
  });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [noticeKey, setNoticeKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("status.active") },
      { value: "inactive", label: t("status.inactive") },
    ],
    [t]
  );

  const formatCurrency = (value: number, currencyCode?: string) =>
    new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
      style: "currency",
      currency: currencyCode || "SAR",
    }).format(value);

  const formatDate = (value: string) => {
    if (!value) {
      return "";
    }
    const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  };

  const loadVendor = useCallback(async () => {
    setLoadingVendor(true);
    const response = await fetch(`/api/vendors/${vendorId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingVendor(false);
      return;
    }
    const data = await response.json();
    setVendor(data.vendor ?? null);
    if (data.vendor) {
      setForm({
        name: data.vendor.name ?? "",
        legalName: data.vendor.legalName ?? "",
        vatRegistered: data.vendor.vatRegistered ?? false,
        vatNumber: data.vendor.vatNumber ?? "",
        crNumber: data.vendor.crNumber ?? "",
        email: data.vendor.email ?? "",
        phone: data.vendor.phone ?? "",
        remittanceAddress: data.vendor.remittanceAddress ?? "",
        paymentTermId: data.vendor.paymentTermId ?? "",
        preferredPaymentMethod: data.vendor.preferredPaymentMethod ?? "",
        currency: data.vendor.currency ?? "SAR",
        notes: data.vendor.notes ?? "",
        tags: Array.isArray(data.vendor.tags) ? data.vendor.tags.join(", ") : "",
        status: data.vendor.status ?? "active",
      });
    }
    setLoadingVendor(false);
  }, [vendorId]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    const response = await fetch(`/api/vendors/${vendorId}/contacts`);
    if (!response.ok) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }
    const data = await response.json();
    setContacts(data.contacts ?? []);
    setLoadingContacts(false);
  }, [vendorId]);

  const loadActivity = useCallback(async () => {
    setLoadingActivity(true);
    const response = await fetch(`/api/vendors/${vendorId}/activity`);
    if (!response.ok) {
      setActivity(null);
      setLoadingActivity(false);
      return;
    }
    const data = await response.json();
    setActivity(data ?? null);
    setLoadingActivity(false);
  }, [vendorId]);

  const loadStatement = useCallback(async () => {
    setLoadingStatement(true);
    const response = await fetch(`/api/vendors/${vendorId}/statement`);
    if (!response.ok) {
      setStatement(null);
      setLoadingStatement(false);
      return;
    }
    const data = await response.json();
    setStatement(data ?? null);
    setLoadingStatement(false);
  }, [vendorId]);

  const loadStatementHistory = useCallback(async () => {
    setLoadingHistory(true);
    const response = await fetch(`/api/vendors/${vendorId}/statement/history`);
    if (!response.ok) {
      setStatementHistory([]);
      setLoadingHistory(false);
      return;
    }
    const data = await response.json();
    setStatementHistory(data.emails ?? []);
    setLoadingHistory(false);
  }, [vendorId]);

  const loadTerms = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    fetch(`/api/payment-terms?companyId=${activeCompanyId}`)
      .then((res) => res.json())
      .then((data) => setTerms(data.terms ?? []))
      .catch(() => setTerms([]));
  }, [activeCompanyId]);

  useEffect(() => {
    loadVendor();
    loadContacts();
    loadActivity();
    loadStatement();
    loadStatementHistory();
  }, [loadActivity, loadContacts, loadStatement, loadStatementHistory, loadVendor]);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !form) {
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/vendors/${vendorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          name: form.name,
          legalName: form.legalName || null,
          vatRegistered: form.vatRegistered,
          vatNumber: form.vatNumber || null,
          crNumber: form.crNumber || null,
          email: form.email || null,
          phone: form.phone || null,
          remittanceAddress: form.remittanceAddress || null,
          paymentTermId: form.paymentTermId || null,
          preferredPaymentMethod: form.preferredPaymentMethod || null,
          currency: form.currency || "SAR",
          notes: form.notes || null,
          tags: formatTags(form.tags),
          status: form.status,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Duplicate vendor") {
          setErrorKey("vendors.duplicate");
        } else if (data?.error === "Invalid payload") {
          setErrorKey("vendors.invalidPayload");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      await loadVendor();
    });
  };

  const handleContactSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId) {
      return;
    }
    const payload = {
      companyId: activeCompanyId,
      name: contactForm.name,
      email: contactForm.email || null,
      phone: contactForm.phone || null,
      role: contactForm.role || null,
      isPrimary: contactForm.isPrimary,
    };

    startTransition(async () => {
      setErrorKey(null);
      if (editingContactId) {
        const response = await fetch(`/api/contacts/${editingContactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          setErrorKey("error.saveFailed");
          return;
        }
      } else {
        const response = await fetch(`/api/vendors/${vendorId}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            partyType: "vendor",
            partyId: vendorId,
          }),
        });
        if (!response.ok) {
          setErrorKey("error.saveFailed");
          return;
        }
      }

      setContactForm({ name: "", email: "", phone: "", role: "", isPrimary: false });
      setEditingContactId(null);
      loadContacts();
    });
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? "",
      isPrimary: contact.isPrimary,
    });
  };

  const handleDeleteContact = (contactId: string) => {
    startTransition(async () => {
      await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
      loadContacts();
    });
  };

  const handleMakePrimary = (contactId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, isPrimary: true }),
      });
      loadContacts();
    });
  };

  const handleSendStatement = () => {
    if (!activeCompanyId) {
      return;
    }
    setSendingStatement(true);
    setErrorKey(null);
    setNoticeKey(null);
    fetch(`/api/vendors/${vendorId}/statement/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    })
      .then(async (res) => {
        if (res.ok) {
          setNoticeKey("vendors.statementSent");
          loadStatementHistory();
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.error === "Vendor email missing") {
          setErrorKey("vendors.statementEmailMissing");
          return;
        }
        setErrorKey("error.saveFailed");
      })
      .finally(() => setSendingStatement(false));
  };

  const handleResendStatement = (emailId: string) => {
    if (!activeCompanyId) {
      return;
    }
    setResendingId(emailId);
    setErrorKey(null);
    setNoticeKey(null);
    fetch(`/api/vendors/${vendorId}/statement/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId }),
    })
      .then(async (res) => {
        if (res.ok) {
          setNoticeKey("vendors.statementResent");
          loadStatementHistory();
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.error === "Invalid email") {
          setErrorKey("vendors.statementResendInvalid");
          return;
        }
        setErrorKey("error.saveFailed");
      })
      .finally(() => setResendingId(null));
  };

  const filteredHistory = statementHistory.filter((entry) => {
    const query = historyQuery.trim().toLowerCase();
    const matchesQuery =
      !query ||
      entry.to.toLowerCase().includes(query) ||
      entry.subject.toLowerCase().includes(query);
    const matchesStatus = historyStatus === "all" || entry.status === historyStatus;
    return matchesQuery && matchesStatus;
  });

  const cancelEditContact = () => {
    setEditingContactId(null);
    setContactForm({ name: "", email: "", phone: "", role: "", isPrimary: false });
  };

  if (loadingVendor && !vendor && !errorKey) {
    return (
      <section className="space-y-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-48" />
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
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-24" />
                <SkeletonBlock className="h-20 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="app-card space-y-3 p-5">
            <SkeletonBlock className="h-5 w-40" />
            {Array.from({ length: 5 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-4 w-full" />
            ))}
          </div>
          <div className="app-card space-y-3 p-5">
            <SkeletonBlock className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-4 w-full" />
            ))}
          </div>
        </div>
        <div className="app-card space-y-4 p-5">
          <SkeletonBlock className="h-5 w-40" />
          <div className="grid gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("vendors.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold">{vendor?.name ?? "-"}</h1>
          {vendor?.legalName ? (
            <p className="text-sm text-muted">{vendor.legalName}</p>
          ) : null}
        </div>
        <Link
          href="/purchases/vendors"
          className="text-xs font-semibold text-muted underline decoration-dotted"
        >
          {t("vendors.title")}
        </Link>
      </div>

      <form onSubmit={handleUpdate} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("vendors.detailsTitle")}</h2>
        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.name")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, name: event.target.value } : prev
                  )
                }
                required
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.legalName")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.legalName}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, legalName: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.crNumber")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.crNumber}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, crNumber: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.vatNumber")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.vatNumber}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, vatNumber: event.target.value } : prev
                  )
                }
                required={form.vatRegistered}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.vatRegistered}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, vatRegistered: event.target.checked } : prev
                  )
                }
              />
              {t("vendors.vatRegistered")}
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
              <input
                type="email"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.email}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, email: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.phone}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, phone: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.paymentTerms")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.paymentTermId}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, paymentTermId: event.target.value } : prev
                  )
                }
              >
                <option value="">{t("common.none")}</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.days} {t("defaults.days")})
                  </option>
                ))}
              </select>
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">
                {t("vendors.preferredPaymentMethod")}
              </span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.preferredPaymentMethod}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, preferredPaymentMethod: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.currency")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.currency}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, currency: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          status: event.target.value as "active" | "inactive",
                        }
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
        ) : (
          <p className="mt-4 text-sm text-muted">{t("common.loading")}</p>
        )}
        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("vendors.remittanceAddress")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.remittanceAddress}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, remittanceAddress: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, notes: event.target.value } : prev
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
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.tags}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, tags: event.target.value } : prev
                  )
                }
                placeholder={t("vendors.tagsHint")}
              />
            </label>
          </div>
        ) : null}
        {noticeKey ? <p className="mt-3 text-xs text-emerald-600">{t(noticeKey)}</p> : null}
        {errorKey ? <p className="mt-3 text-xs text-red-500">{t(errorKey)}</p> : null}
        <button
          type="submit"
          className="mt-4 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
          disabled={isPending}
        >
          {t("common.save")}
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="app-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("vendors.agingTitle")}</h2>
            <p className="text-xs text-muted">{t("vendors.balanceDue")}</p>
          </div>
          {loadingActivity ? (
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-4 w-full" />
              ))}
            </div>
          ) : activity?.aging ? (
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{t("aging.current")}</span>
                <span>{formatCurrency(activity.aging.current, vendor?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days1to30")}</span>
                <span>{formatCurrency(activity.aging.days1to30, vendor?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days31to60")}</span>
                <span>{formatCurrency(activity.aging.days31to60, vendor?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days61to90")}</span>
                <span>{formatCurrency(activity.aging.days61to90, vendor?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days90plus")}</span>
                <span>{formatCurrency(activity.aging.days90plus, vendor?.currency)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <span>{t("common.balance")}</span>
                <span>{formatCurrency(activity.aging.total, vendor?.currency)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("vendors.noOpenItems")}</p>
          )}
        </div>

        <div className="app-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("vendors.activityTitle")}</h2>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span>{activity?.items.length ?? 0}</span>
              <Link
                href="/reports"
                className="font-semibold text-foreground underline decoration-dotted"
              >
                {t("common.viewTransactions")}
              </Link>
            </div>
          </div>
          {loadingActivity ? (
            <div className="mt-4 space-y-3">
              <SkeletonBlock className="h-4 w-40" />
              {Array.from({ length: 4 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-8 w-full" />
              ))}
            </div>
          ) : activity?.items.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.documentType")}</th>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.documentNumber")}</th>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.amount")}</th>
                    <th className={`px-2 py-2 ${alignClass}`}>{t("common.balance")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-2 py-2">{item.docType}</td>
                      <td className="px-2 py-2">{item.docNumber}</td>
                      <td className="px-2 py-2">{formatDate(item.issueDate)}</td>
                      <td className="px-2 py-2">{formatDate(item.dueDate)}</td>
                      <td className="px-2 py-2">{formatCurrency(item.amount, item.currency)}</td>
                      <td className="px-2 py-2">{formatCurrency(item.balance, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("vendors.noOpenItems")}</p>
          )}
        </div>
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("vendors.statementTitle")}</h2>
            <p className="text-xs text-muted">{t("vendors.statementSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <a
              href={`/api/vendors/${vendorId}/statement/export`}
              className="rounded-xl border border-border px-3 py-2"
            >
              {t("vendors.statementExportCsv")}
            </a>
            <Link
              href={`/purchases/vendors/${vendorId}/statement/print`}
              className="rounded-xl border border-border px-3 py-2"
            >
              {t("vendors.statementExportPdf")}
            </Link>
            <button
              type="button"
              onClick={() =>
                window.open(
                  `/purchases/vendors/${vendorId}/statement/print?print=1`,
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              className="rounded-xl border border-border px-3 py-2"
            >
              {t("vendors.statementQuickPrint")}
            </button>
            <button
              type="button"
              onClick={handleSendStatement}
              className="rounded-xl border border-border px-3 py-2"
              disabled={sendingStatement}
            >
              {sendingStatement ? t("common.loading") : t("vendors.sendStatement")}
            </button>
          </div>
        </div>
        {noticeKey ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t(noticeKey)}
          </div>
        ) : null}
        {errorKey ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {t(errorKey)}
          </div>
        ) : null}
        {loadingStatement ? (
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-8 w-full" />
          </div>
        ) : statement ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("vendors.statementInvoiced")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.billed, vendor?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("vendors.statementPaid")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.paid, vendor?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("vendors.statementCredited")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.credited, vendor?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("vendors.statementBalance")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.balance, vendor?.currency)}
                </p>
              </div>
            </div>
            {statement.bills.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("bill.number")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.balance")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {statement.bills.map((bill) => (
                      <tr key={bill.billId}>
                        <td className="px-3 py-2">
                          <Link
                            href={`/purchases/bills/${bill.billId}`}
                            className="text-primary underline decoration-dotted"
                          >
                            {bill.billNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{formatDate(bill.billDate)}</td>
                        <td className="px-3 py-2">{formatDate(bill.dueDate)}</td>
                        <td className="px-3 py-2">
                          {formatCurrency(bill.total, bill.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {formatCurrency(bill.balance, bill.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {t(`bill.status.${bill.status ?? "draft"}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("vendors.statementEmpty")}</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("vendors.statementEmpty")}</p>
        )}
        <div className="mt-6 border-t border-border/60 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("vendors.statementHistoryTitle")}</h3>
            <span className="text-xs text-muted">{filteredHistory.length}</span>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder={t("vendors.statementHistorySearch")}
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
              <select
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={historyStatus}
                onChange={(event) => setHistoryStatus(event.target.value)}
              >
                <option value="all">{t("common.all")}</option>
                <option value="queued">{t("status.queued")}</option>
                <option value="sending">{t("status.sending")}</option>
                <option value="sent">{t("status.sent")}</option>
                <option value="failed">{t("status.failed")}</option>
              </select>
            </label>
          </div>
          {loadingHistory ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <SkeletonBlock key={idx} className="h-5 w-full" />
              ))}
            </div>
          ) : filteredHistory.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-muted">
                  <tr>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.email")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.createdAt")}</th>
                    <th className={`px-3 py-2 ${alignClass}`}>{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHistory.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-3 py-2">{entry.to}</td>
                      <td className="px-3 py-2">
                        {t(`status.${entry.status ?? "undefined"}`)}
                      </td>
                      <td className="px-3 py-2">{formatDate(entry.createdAt)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => handleResendStatement(entry.id)}
                          className="text-xs font-semibold text-foreground underline decoration-dotted"
                          disabled={resendingId === entry.id}
                        >
                          {resendingId === entry.id
                            ? t("common.loading")
                            : t("vendors.statementResend")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("vendors.statementHistoryEmpty")}</p>
          )}
        </div>
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("vendors.contactsTitle")}</h2>
          <span className="text-xs text-muted">
            {loadingContacts ? "—" : contacts.length}
          </span>
        </div>
        <form onSubmit={handleContactSubmit} className="mt-4 grid gap-4 md:grid-cols-5">
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("contacts.name")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={contactForm.name}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, name: event.target.value }))
              }
              required
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
            <input
              type="email"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={contactForm.email}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={contactForm.phone}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, phone: event.target.value }))
              }
            />
          </label>
          <label className={`text-sm ${alignClass}`}>
            <span className="mb-1 block text-xs text-muted">{t("contacts.role")}</span>
            <input
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              value={contactForm.role}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, role: event.target.value }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={contactForm.isPrimary}
              onChange={(event) =>
                setContactForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
              }
            />
            {t("contacts.primary")}
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
              disabled={isPending}
            >
              {editingContactId ? t("vendors.editContact") : t("vendors.addContact")}
            </button>
            {editingContactId ? (
              <button
                type="button"
                onClick={cancelEditContact}
                className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted"
              >
                {t("common.cancel")}
              </button>
            ) : null}
          </div>
        </form>

        {loadingContacts ? (
          <div className="mt-4 space-y-3">
            <SkeletonBlock className="h-4 w-40" />
            {Array.from({ length: 4 }).map((_, idx) => (
              <SkeletonBlock key={idx} className="h-8 w-full" />
            ))}
          </div>
        ) : contacts.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("contacts.name")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.email")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.phone")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("contacts.role")}</th>
                  <th className={`px-2 py-2 ${alignClass}`}>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map((contact) => (
                  <tr key={contact.id}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{contact.name}</span>
                        {contact.isPrimary ? (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-muted">
                            {t("contacts.primary")}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">{contact.email ?? "-"}</td>
                    <td className="px-2 py-2">{contact.phone ?? "-"}</td>
                    <td className="px-2 py-2">{contact.role ?? "-"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <button
                          type="button"
                          onClick={() => handleEditContact(contact)}
                          className="font-semibold text-foreground underline decoration-dotted"
                        >
                          {t("common.edit")}
                        </button>
                        {!contact.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => handleMakePrimary(contact.id)}
                            className="font-semibold text-primary"
                          >
                            {t("contacts.makePrimary")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(contact.id)}
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
          <p className="mt-4 text-sm text-muted">{t("vendors.noContacts")}</p>
        )}
      </div>
    </section>
  );
}
