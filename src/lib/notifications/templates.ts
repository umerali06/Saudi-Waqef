import type { Locale } from "@/i18n/messages";
import type { NotificationType } from "@/lib/notifications/types";

const template = (ar: string, en: string) => ({ ar, en });

type Template = {
  title: Record<Locale, string>;
  subject: Record<Locale, string>;
  body: Record<Locale, string>;
};

export const notificationTemplates: Record<NotificationType, Template> = {
  invoice_sent: {
    title: template("تم إرسال الفاتورة", "Invoice sent"),
    subject: template("تم إرسال الفاتورة {invoiceNumber}", "Invoice {invoiceNumber} sent"),
    body: template(
      "تم إرسال الفاتورة {invoiceNumber} للعميل {customerName} بقيمة {amount} {currency}.",
      "Invoice {invoiceNumber} was sent to {customerName} for {amount} {currency}."
    ),
  },
  invoice_overdue: {
    title: template("فاتورة متأخرة", "Invoice overdue"),
    subject: template("الفاتورة {invoiceNumber} متأخرة", "Invoice {invoiceNumber} is overdue"),
    body: template(
      "الفاتورة {invoiceNumber} تجاوزت تاريخ الاستحقاق {dueDate} بقيمة {amount} {currency}.",
      "Invoice {invoiceNumber} is overdue since {dueDate} for {amount} {currency}."
    ),
  },
  invoice_paid: {
    title: template("فاتورة مدفوعة", "Invoice paid"),
    subject: template("تم سداد الفاتورة {invoiceNumber}", "Invoice {invoiceNumber} paid"),
    body: template(
      "تم استلام دفعة الفاتورة {invoiceNumber} بقيمة {amount} {currency}.",
      "Payment received for invoice {invoiceNumber} ({amount} {currency})."
    ),
  },
  customer_statement_sent: {
    title: template("تم إرسال كشف حساب", "Statement sent"),
    subject: template(
      "تم إرسال كشف حساب {customerName}",
      "Statement sent to {customerName}"
    ),
    body: template(
      "تم إرسال كشف حساب العميل {customerName}.",
      "Customer statement was sent to {customerName}."
    ),
  },
  vendor_statement_sent: {
    title: template("تم إرسال كشف حساب المورد", "Vendor statement sent"),
    subject: template(
      "تم إرسال كشف حساب المورد {vendorName}",
      "Statement sent to vendor {vendorName}"
    ),
    body: template(
      "تم إرسال كشف حساب المورد {vendorName}.",
      "Vendor statement was sent to {vendorName}."
    ),
  },
  bill_due: {
    title: template("فاتورة مورد مستحقة", "Bill due"),
    subject: template("فاتورة المورد {billNumber} مستحقة", "Vendor bill {billNumber} is due"),
    body: template(
      "فاتورة المورد {billNumber} مستحقة في {dueDate} بقيمة {amount} {currency}.",
      "Vendor bill {billNumber} is due on {dueDate} for {amount} {currency}."
    ),
  },
  bill_paid: {
    title: template("تم سداد فاتورة مورد", "Bill paid"),
    subject: template("تم سداد فاتورة المورد {billNumber}", "Vendor bill {billNumber} paid"),
    body: template(
      "تم سداد فاتورة المورد {billNumber} بقيمة {amount} {currency}.",
      "Vendor bill {billNumber} has been paid ({amount} {currency})."
    ),
  },
  payroll_approved: {
    title: template("تم اعتماد الرواتب", "Payroll approved"),
    subject: template("تم اعتماد دورة الرواتب", "Payroll run approved"),
    body: template(
      "تم اعتماد دورة الرواتب للفترة {periodStart} إلى {periodEnd}.",
      "Payroll run for {periodStart} to {periodEnd} has been approved."
    ),
  },
  payslip_available: {
    title: template("قسيمة راتب متاحة", "Payslip available"),
    subject: template("قسيمة راتبك جاهزة", "Your payslip is ready"),
    body: template(
      "تم توفير قسيمة راتب جديدة للفترة {periodStart} إلى {periodEnd}.",
      "A new payslip is available for {periodStart} to {periodEnd}."
    ),
  },
  leave_approved: {
    title: template("تمت الموافقة على الإجازة", "Leave approved"),
    subject: template("تمت الموافقة على طلب الإجازة", "Leave request approved"),
    body: template(
      "تمت الموافقة على إجازتك من {startDate} إلى {endDate}.",
      "Your leave request from {startDate} to {endDate} was approved."
    ),
  },
  leave_rejected: {
    title: template("تم رفض الإجازة", "Leave rejected"),
    subject: template("تم رفض طلب الإجازة", "Leave request rejected"),
    body: template(
      "تم رفض إجازتك من {startDate} إلى {endDate}.", 
      "Your leave request from {startDate} to {endDate} was rejected."
    ),
  },
  subscription_payment_success: {
    title: template("نجاح الدفع", "Payment successful"),
    subject: template("نجاح سداد الاشتراك", "Subscription payment successful"),
    body: template(
      "تم استلام دفعة الاشتراك للفاتورة {invoiceNumber} بقيمة {amount} {currency}.",
      "Subscription invoice {invoiceNumber} was paid ({amount} {currency})."
    ),
  },
  subscription_payment_failed: {
    title: template("فشل الدفع", "Payment failed"),
    subject: template("فشل سداد الاشتراك", "Subscription payment failed"),
    body: template(
      "فشل تحصيل دفعة الاشتراك للفاتورة {invoiceNumber}.", 
      "Subscription payment failed for invoice {invoiceNumber}."
    ),
  },
};

export const templateSamples: Record<NotificationType, Record<string, string>> = {
  invoice_sent: {
    invoiceNumber: "INV-1024",
    customerName: "شركة المثال",
    amount: "2500",
    currency: "SAR",
  },
  invoice_overdue: {
    invoiceNumber: "INV-1024",
    dueDate: "2026-01-20",
    amount: "2500",
    currency: "SAR",
  },
  invoice_paid: {
    invoiceNumber: "INV-1024",
    amount: "2500",
    currency: "SAR",
  },
  customer_statement_sent: {
    customerName: "شركة المثال",
  },
  vendor_statement_sent: {
    vendorName: "شركة المورد",
  },
  bill_due: {
    billNumber: "BILL-220",
    dueDate: "2026-02-01",
    amount: "1800",
    currency: "SAR",
  },
  bill_paid: {
    billNumber: "BILL-220",
    amount: "1800",
    currency: "SAR",
  },
  payroll_approved: {
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
  },
  payslip_available: {
    periodStart: "2026-01-01",
    periodEnd: "2026-01-31",
  },
  leave_approved: {
    startDate: "2026-02-05",
    endDate: "2026-02-07",
  },
  leave_rejected: {
    startDate: "2026-02-05",
    endDate: "2026-02-07",
  },
  subscription_payment_success: {
    invoiceNumber: "SUB-300",
    amount: "500",
    currency: "SAR",
  },
  subscription_payment_failed: {
    invoiceNumber: "SUB-300",
  },
};

export function renderTemplate(
  type: NotificationType,
  locale: Locale,
  params: Record<string, string> = {}
) {
  const tpl = notificationTemplates[type];
  const data = { ...templateSamples[type], ...params };
  const replace = (value: string) =>
    Object.keys(data).reduce(
      (result, key) => result.replace(new RegExp(`\\{${key}\\}`, "g"), data[key]),
      value
    );

  return {
    title: replace(tpl.title[locale]),
    subject: replace(tpl.subject[locale]),
    body: replace(tpl.body[locale]),
  };
}
