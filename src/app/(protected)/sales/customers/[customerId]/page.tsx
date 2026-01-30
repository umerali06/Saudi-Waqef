"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import type { AgingSummary } from "@/lib/data/open-items";

type Customer = {
  id: string;
  companyId: string;
  name: string;
  legalName?: string;
  vatRegistered: boolean;
  vatNumber?: string;
  crNumber?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
  paymentTermId?: string | null;
  creditLimit?: number | null;
  currency?: string;
  notes?: string;
  tags: string[];
  status: "active" | "inactive" | "blacklisted";
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

type StatementInvoice = {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
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
    invoiced: number;
    paid: number;
    credited: number;
    balance: number;
  };
  aging?: AgingSummary | null;
  invoices: StatementInvoice[];
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

type CustomerFormState = {
  name: string;
  legalName: string;
  vatRegistered: boolean;
  vatNumber: string;
  crNumber: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  paymentTermId: string;
  creditLimit: string;
  currency: string;
  notes: string;
  tags: string;
  status: "active" | "inactive" | "blacklisted";
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

export default function CustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activity, setActivity] = useState<ActivityPayload | null>(null);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [sendingStatement, setSendingStatement] = useState(false);
  const [statementHistory, setStatementHistory] = useState<StatementEmail[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [form, setForm] = useState<CustomerFormState | null>(null);
  const [statement, setStatement] = useState<StatementPayload | null>(null);
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
      { value: "blacklisted", label: t("status.blacklisted") },
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
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US").format(date);
  };

  const loadCustomer = useCallback(async () => {
    setLoadingCustomer(true);
    const response = await fetch(`/api/customers/${customerId}`);
    if (!response.ok) {
      setErrorKey("error.loadFailed");
      setLoadingCustomer(false);
      return;
    }
    const data = await response.json();
    setCustomer(data.customer ?? null);
    if (data.customer) {
      setForm({
        name: data.customer.name ?? "",
        legalName: data.customer.legalName ?? "",
        vatRegistered: data.customer.vatRegistered ?? false,
        vatNumber: data.customer.vatNumber ?? "",
        crNumber: data.customer.crNumber ?? "",
        email: data.customer.email ?? "",
        phone: data.customer.phone ?? "",
        billingAddress: data.customer.billingAddress ?? "",
        shippingAddress: data.customer.shippingAddress ?? "",
        paymentTermId: data.customer.paymentTermId ?? "",
        creditLimit:
          data.customer.creditLimit !== null && data.customer.creditLimit !== undefined
            ? String(data.customer.creditLimit)
            : "",
        currency: data.customer.currency ?? "SAR",
        notes: data.customer.notes ?? "",
        tags: Array.isArray(data.customer.tags) ? data.customer.tags.join(", ") : "",
        status: data.customer.status ?? "active",
      });
    }
    setLoadingCustomer(false);
  }, [customerId]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    const response = await fetch(`/api/customers/${customerId}/contacts`);
    if (!response.ok) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }
    const data = await response.json();
    setContacts(data.contacts ?? []);
    setLoadingContacts(false);
  }, [customerId]);

  const loadActivity = useCallback(async () => {
    setLoadingActivity(true);
    const response = await fetch(`/api/customers/${customerId}/activity`);
    if (!response.ok) {
      setActivity(null);
      setLoadingActivity(false);
      return;
    }
    const data = await response.json();
    setActivity(data ?? null);
    setLoadingActivity(false);
  }, [customerId]);

  const loadStatement = useCallback(async () => {
    setLoadingStatement(true);
    const response = await fetch(`/api/customers/${customerId}/statement`);
    if (!response.ok) {
      setStatement(null);
      setLoadingStatement(false);
      return;
    }
    const data = await response.json();
    setStatement(data ?? null);
    setLoadingStatement(false);
  }, [customerId]);

  const loadStatementHistory = useCallback(async () => {
    setLoadingHistory(true);
    const response = await fetch(`/api/customers/${customerId}/statement/history`);
    if (!response.ok) {
      setStatementHistory([]);
      setLoadingHistory(false);
      return;
    }
    const data = await response.json();
    setStatementHistory(data.emails ?? []);
    setLoadingHistory(false);
  }, [customerId]);

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
    loadCustomer();
    loadContacts();
    loadActivity();
    loadStatement();
    loadStatementHistory();
  }, [loadCustomer, loadContacts, loadActivity, loadStatement, loadStatementHistory]);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  const handleUpdate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCompanyId || !form) {
      return;
    }
    const creditLimitValue = form.creditLimit.trim();
    const creditValue = creditLimitValue ? Number(creditLimitValue) : null;
    if (creditLimitValue && Number.isNaN(creditValue)) {
      setErrorKey("customers.creditInvalid");
      return;
    }

    startTransition(async () => {
      setErrorKey(null);
      const response = await fetch(`/api/customers/${customerId}`, {
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
          billingAddress: form.billingAddress || null,
          shippingAddress: form.shippingAddress || null,
          paymentTermId: form.paymentTermId || null,
          creditLimit: creditValue,
          currency: form.currency || "SAR",
          notes: form.notes || null,
          tags: formatTags(form.tags),
          status: form.status,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "Duplicate customer") {
          setErrorKey("customers.duplicate");
        } else if (data?.error === "Invalid payload") {
          setErrorKey("customers.invalidPayload");
        } else {
          setErrorKey("error.saveFailed");
        }
        return;
      }
      await loadCustomer();
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
        const response = await fetch(
          `/api/customers/${customerId}/contacts/${editingContactId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              partyType: "customer",
              partyId: customerId,
            }),
          }
        );
        if (!response.ok) {
          setErrorKey("error.saveFailed");
          return;
        }
      } else {
        const response = await fetch(`/api/customers/${customerId}/contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            partyType: "customer",
            partyId: customerId,
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
      await fetch(`/api/customers/${customerId}/contacts/${contactId}`, {
        method: "DELETE",
      });
      loadContacts();
    });
  };

  const handleMakePrimary = (contactId: string) => {
    if (!activeCompanyId) {
      return;
    }
    startTransition(async () => {
      const contact = contacts.find((item) => item.id === contactId);
      if (!contact) {
        return;
      }
      await fetch(`/api/customers/${customerId}/contacts/${contactId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          partyType: "customer",
          partyId: customerId,
          name: contact.name,
          email: contact.email ?? null,
          phone: contact.phone ?? null,
          role: contact.role ?? null,
          isPrimary: true,
        }),
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
    fetch(`/api/customers/${customerId}/statement/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    })
      .then(async (res) => {
        if (res.ok) {
          setNoticeKey("customers.statementSent");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.error === "Customer email missing") {
          setErrorKey("customers.statementEmailMissing");
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
    fetch(`/api/customers/${customerId}/statement/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId }),
    })
      .then(async (res) => {
        if (res.ok) {
          setNoticeKey("customers.statementResent");
          loadStatementHistory();
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data?.error === "Invalid email") {
          setErrorKey("customers.statementResendInvalid");
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

  if (loadingCustomer && !customer && !errorKey) {
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
          <p className="text-xs text-muted">{t("customers.detailsTitle")}</p>
          <h1 className="text-2xl font-semibold">{customer?.name ?? "-"}</h1>
          {customer?.legalName ? (
            <p className="text-sm text-muted">{customer.legalName}</p>
          ) : null}
        </div>
        <Link
          href="/sales/customers"
          className="text-xs font-semibold text-muted underline decoration-dotted"
        >
          {t("customers.title")}
        </Link>
      </div>

      <form onSubmit={handleUpdate} className="app-card p-5">
        <h2 className="text-lg font-semibold">{t("customers.detailsTitle")}</h2>
        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("customers.name")}</span>
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
              <span className="mb-1 block text-xs text-muted">{t("customers.legalName")}</span>
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
              <span className="mb-1 block text-xs text-muted">{t("customers.crNumber")}</span>
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
              <span className="mb-1 block text-xs text-muted">{t("customers.vatNumber")}</span>
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
              {t("customers.vatRegistered")}
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
              <span className="mb-1 block text-xs text-muted">{t("customers.paymentTerms")}</span>
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
              <span className="mb-1 block text-xs text-muted">{t("customers.creditLimit")}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.creditLimit}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, creditLimit: event.target.value } : prev
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
                          status: event.target.value as "active" | "inactive" | "blacklisted",
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
              <span className="mb-1 block text-xs text-muted">{t("customers.billingAddress")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.billingAddress}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, billingAddress: event.target.value } : prev
                  )
                }
              />
            </label>
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("customers.shippingAddress")}</span>
              <textarea
                className="min-h-[90px] w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                value={form.shippingAddress}
                onChange={(event) =>
                  setForm((prev) =>
                    prev ? { ...prev, shippingAddress: event.target.value } : prev
                  )
                }
              />
            </label>
          </div>
        ) : null}
        {form ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                placeholder={t("customers.tagsHint")}
              />
            </label>
          </div>
        ) : null}
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
            <h2 className="text-lg font-semibold">{t("customers.agingTitle")}</h2>
            <p className="text-xs text-muted">{t("customers.balanceDue")}</p>
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
                <span>{formatCurrency(activity.aging.current, customer?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days1to30")}</span>
                <span>{formatCurrency(activity.aging.days1to30, customer?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days31to60")}</span>
                <span>{formatCurrency(activity.aging.days31to60, customer?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days61to90")}</span>
                <span>{formatCurrency(activity.aging.days61to90, customer?.currency)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("aging.days90plus")}</span>
                <span>{formatCurrency(activity.aging.days90plus, customer?.currency)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                <span>{t("common.balance")}</span>
                <span>{formatCurrency(activity.aging.total, customer?.currency)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("customers.noOpenItems")}</p>
          )}
        </div>

        <div className="app-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("customers.activityTitle")}</h2>
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
                      <td className="px-2 py-2">
                        {formatCurrency(item.amount, item.currency)}
                      </td>
                      <td className="px-2 py-2">
                        {formatCurrency(item.balance, item.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">{t("customers.noOpenItems")}</p>
          )}
        </div>
      </div>

      <div className="app-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t("customers.statementTitle")}</h2>
              <p className="text-xs text-muted">{t("customers.statementSubtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <a
                href={`/api/customers/${customerId}/statement/export`}
                className="rounded-xl border border-border px-3 py-2"
              >
                {t("customers.statementExportCsv")}
              </a>
              <Link
                href={`/sales/customers/${customerId}/statement/print`}
                className="rounded-xl border border-border px-3 py-2"
              >
                {t("customers.statementExportPdf")}
              </Link>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `/sales/customers/${customerId}/statement/print?print=1`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="rounded-xl border border-border px-3 py-2"
              >
                {t("customers.statementQuickPrint")}
              </button>
              <button
                type="button"
                onClick={handleSendStatement}
                className="rounded-xl border border-border px-3 py-2"
                disabled={sendingStatement}
              >
                {sendingStatement ? t("common.loading") : t("customers.sendStatement")}
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
                <p className="text-muted">{t("customers.statementInvoiced")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.invoiced, customer?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementPaid")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.paid, customer?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementCredited")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.credited, customer?.currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
                <p className="text-muted">{t("customers.statementBalance")}</p>
                <p className="font-semibold">
                  {formatCurrency(statement.totals.balance, customer?.currency)}
                </p>
              </div>
            </div>
            {statement.invoices.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted text-muted">
                    <tr>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("invoice.number")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.issueDate")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.dueDate")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.amount")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.balance")}</th>
                      <th className={`px-3 py-2 ${alignClass}`}>{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {statement.invoices.map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td className="px-3 py-2">
                          <Link
                            href={`/sales/invoices/${inv.invoiceId}`}
                            className="text-primary underline decoration-dotted"
                          >
                            {inv.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{formatDate(inv.invoiceDate)}</td>
                        <td className="px-3 py-2">{formatDate(inv.dueDate)}</td>
                        <td className="px-3 py-2">
                          {formatCurrency(inv.total, inv.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {formatCurrency(inv.balance, inv.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {t(`invoice.status.${inv.status ?? "draft"}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("customers.statementEmpty")}</p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">{t("customers.statementEmpty")}</p>
        )}
        <div className="mt-6 border-t border-border/60 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t("customers.statementHistoryTitle")}</h3>
            <span className="text-xs text-muted">{filteredHistory.length}</span>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <label className={`text-sm ${alignClass}`}>
              <span className="mb-1 block text-xs text-muted">{t("common.search")}</span>
              <input
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                placeholder={t("customers.statementHistorySearch")}
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
                            : t("customers.statementResend")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("customers.statementHistoryEmpty")}</p>
          )}
        </div>
      </div>

      <div className="app-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("customers.contactsTitle")}</h2>
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
              {editingContactId ? t("customers.editContact") : t("customers.addContact")}
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
          <p className="mt-4 text-sm text-muted">{t("customers.noContacts")}</p>
        )}
      </div>
    </section>
  );
}
