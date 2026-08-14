export const NOTIFICATION_TYPES = [
  "invoice_sent",
  "invoice_overdue",
  "invoice_paid",
  "customer_statement_sent",
  "vendor_statement_sent",
  "bill_due",
  "bill_paid",
  "payroll_approved",
  "payslip_available",
  "leave_approved",
  "leave_rejected",
  "subscription_payment_success",
  "subscription_payment_failed",
  "registration_received",
  "zatca_certificate_expiring",
  "zatca_certificate_expired",
  "zatca_reporting_sla_risk",
  "zatca_reporting_sla_breached",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationChannel = "email" | "in_app" | "sms";
