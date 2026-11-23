import type { NotificationType } from "@/lib/notifications/types";

const PAGES: Partial<Record<NotificationType, string>> = {
  invoice_sent: "/sales/invoices",
  invoice_overdue: "/sales/invoices",
  invoice_paid: "/sales/invoices",
  customer_statement_sent: "/sales/customers",
  vendor_statement_sent: "/purchases/vendors",
  bill_due: "/purchases/bills",
  bill_paid: "/purchases/bills",
  payroll_approved: "/hr/payroll",
  payslip_available: "/hr/my-profile",
  leave_approved: "/hr/leave",
  leave_rejected: "/hr/leave",
  subscription_payment_success: "/billing",
  subscription_payment_failed: "/billing",
  registration_received: "/admin/registrations",
  support_ticket: "/support",
  employee_link_request: "/hr/employees",
  zatca_certificate_expiring: "/settings/integrations/zatca",
  zatca_certificate_expired: "/settings/integrations/zatca",
  zatca_reporting_sla_risk: "/settings/integrations/zatca",
  zatca_reporting_sla_breached: "/settings/integrations/zatca",
  zatca_rejection_spike: "/settings/integrations/zatca",
  zatca_submission_stalled: "/settings/integrations/zatca",
  zatca_integration_unhealthy: "/settings/integrations/zatca",
};

const URGENT = new Set<NotificationType>([
  "registration_received",
  "support_ticket",
  "platform_event",
  "subscription_payment_failed",
  "zatca_certificate_expired",
  "zatca_reporting_sla_breached",
  "zatca_rejection_spike",
  "zatca_integration_unhealthy",
]);

/** Where a notification leads. An explicit `data.url` wins, but only inside this site. */
export const notificationUrl = (type: string, data?: Record<string, unknown> | null) => {
  const url = data?.url;
  if (typeof url === "string" && /^\/(?!\/)/.test(url)) return url;
  return PAGES[type as NotificationType] ?? "/notifications";
};

export const isUrgentNotification = (type: string) => URGENT.has(type as NotificationType);
