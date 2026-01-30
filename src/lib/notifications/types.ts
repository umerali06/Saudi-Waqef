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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationChannel = "email" | "in_app" | "sms";
