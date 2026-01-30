import { z } from "zod";

const vatRegex = /^3\d{13}3$/;

export const companyProfileSchema = z
  .object({
    name: z.string().min(2),
    legalName: z.string().optional().nullable(),
    vatNumber: z.string().optional().nullable(),
    crNumber: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    currency: z.string().optional().nullable(),
    fiscalYearStart: z.string().optional().nullable(),
    timezone: z.string().optional().nullable(),
    defaultLanguage: z.enum(["ar", "en"]).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const vatNumber = data.vatNumber?.trim() ?? "";
    if (vatNumber && !vatRegex.test(vatNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid VAT number",
        path: ["vatNumber"],
      });
    }
  });

export const companyConfigSchema = z.object({
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(100).optional(),
  vatFilingFrequency: z.enum(["monthly", "quarterly"]).optional(),
  taxInclusive: z.boolean().optional(),
  invoicePrefix: z.string().optional(),
  invoiceSuffix: z.string().optional(),
  invoiceNextNumber: z.number().int().min(1).optional(),
  invoicePadding: z.number().int().min(0).max(12).optional(),
  invoiceResetYearly: z.boolean().optional(),
  invoiceLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  billPrefix: z.string().optional(),
  billSuffix: z.string().optional(),
  billNextNumber: z.number().int().min(1).optional(),
  billPadding: z.number().int().min(0).max(12).optional(),
  billResetYearly: z.boolean().optional(),
  billLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  creditPrefix: z.string().optional(),
  creditSuffix: z.string().optional(),
  creditNextNumber: z.number().int().min(1).optional(),
  creditPadding: z.number().int().min(0).max(12).optional(),
  creditResetYearly: z.boolean().optional(),
  creditLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  vendorCreditPrefix: z.string().optional(),
  vendorCreditSuffix: z.string().optional(),
  vendorCreditNextNumber: z.number().int().min(1).optional(),
  vendorCreditPadding: z.number().int().min(0).max(12).optional(),
  vendorCreditResetYearly: z.boolean().optional(),
  vendorCreditLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  receiptPrefix: z.string().optional(),
  receiptSuffix: z.string().optional(),
  receiptNextNumber: z.number().int().min(1).optional(),
  receiptPadding: z.number().int().min(0).max(12).optional(),
  receiptResetYearly: z.boolean().optional(),
  receiptLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  vendorPaymentPrefix: z.string().optional(),
  vendorPaymentSuffix: z.string().optional(),
  vendorPaymentNextNumber: z.number().int().min(1).optional(),
  vendorPaymentPadding: z.number().int().min(0).max(12).optional(),
  vendorPaymentResetYearly: z.boolean().optional(),
  vendorPaymentLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  transferPrefix: z.string().optional(),
  transferSuffix: z.string().optional(),
  transferNextNumber: z.number().int().min(1).optional(),
  transferPadding: z.number().int().min(0).max(12).optional(),
  transferResetYearly: z.boolean().optional(),
  transferLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  adjustmentPrefix: z.string().optional(),
  adjustmentSuffix: z.string().optional(),
  adjustmentNextNumber: z.number().int().min(1).optional(),
  adjustmentPadding: z.number().int().min(0).max(12).optional(),
  adjustmentResetYearly: z.boolean().optional(),
  adjustmentLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  expensePrefix: z.string().optional(),
  expenseSuffix: z.string().optional(),
  expenseNextNumber: z.number().int().min(1).optional(),
  expensePadding: z.number().int().min(0).max(12).optional(),
  expenseResetYearly: z.boolean().optional(),
  expenseLastResetYear: z.number().int().min(2000).max(2100).optional().nullable(),
  invoiceTemplate: z.enum(["classic", "modern", "minimal"]).optional(),
  billTemplate: z.enum(["classic", "modern", "minimal"]).optional(),
  signatureEnabled: z.boolean().optional(),
  signatureName: z.string().max(120).optional().nullable(),
  signatureTitle: z.string().max(120).optional().nullable(),
  signatureImageUrl: z.string().url().optional().nullable(),
  dateFormat: z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]).optional(),
  timeFormat: z.enum(["24h", "12h"]).optional(),
  roundingPrecision: z.number().int().min(0).max(6).optional(),
  roundingMode: z.enum(["standard", "up", "down"]).optional(),
  billApprovalThreshold: z.number().min(0).optional(),
  payrollApprovalThreshold: z.number().min(0).optional(),
  periodLockDate: z.string().optional().nullable(),
  onboardingCompleted: z.boolean().optional(),
});

export const accountSchema = z.object({
  companyId: z.string().min(1),
  code: z.string().regex(/^\d{4}$/),
  name: z.string().min(2),
  type: z.enum(["asset", "liability", "equity", "income", "expense", "cogs"]),
  parentId: z.string().optional().nullable(),
  isPosting: z.boolean().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const accountUpdateSchema = z.object({
  code: z.string().regex(/^\d{4}$/).optional(),
  name: z.string().min(2).optional(),
  type: z.enum(["asset", "liability", "equity", "income", "expense", "cogs"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  parentId: z.string().optional().nullable(),
  isPosting: z.boolean().optional(),
});

export const openingBalanceSchema = z.object({
  companyId: z.string().min(1),
  asOfDate: z.string().optional(),
  entries: z.array(
    z.object({
      accountId: z.string().min(1),
      debit: z.number().min(0),
      credit: z.number().min(0),
    })
  ),
});

export const coaTemplateItemSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  name: z.string().min(2),
  type: z.enum(["asset", "liability", "equity", "income", "expense", "cogs"]),
  parentCode: z.string().regex(/^\d{4}$/).optional(),
  isPosting: z.boolean(),
  system: z.boolean().optional(),
});

export const coaTemplateSchema = z.object({
  companyId: z.string().min(1),
  template: z.array(coaTemplateItemSchema).min(1),
});

export const companyDefaultsSchema = z.object({
  companyId: z.string().min(1),
  salesAccountId: z.string().optional().nullable(),
  purchasesAccountId: z.string().optional().nullable(),
  vatOutputAccountId: z.string().optional().nullable(),
  vatInputAccountId: z.string().optional().nullable(),
  discountAccountId: z.string().optional().nullable(),
  receivableAccountId: z.string().optional().nullable(),
  payableAccountId: z.string().optional().nullable(),
  defaultSalesTaxCategoryId: z.string().optional().nullable(),
  defaultPurchaseTaxCategoryId: z.string().optional().nullable(),
  defaultSalesPaymentTermId: z.string().optional().nullable(),
  defaultPurchasePaymentTermId: z.string().optional().nullable(),
});

export const taxCategorySchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  rate: z.number().min(0).max(100),
  type: z.enum(["standard", "zero", "exempt"]),
  status: z.enum(["active", "inactive"]).optional(),
});

export const taxCategoryUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  rate: z.number().min(0).max(100).optional(),
  type: z.enum(["standard", "zero", "exempt"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const paymentTermSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  days: z.number().int().min(0).max(365),
  status: z.enum(["active", "inactive"]).optional(),
});

export const paymentTermUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  days: z.number().int().min(0).max(365).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const documentBrandingSchema = z.object({
  companyId: z.string().min(1),
  logoUrl: z.string().url().optional().nullable(),
  header: z.string().max(500).optional().nullable(),
  footer: z.string().max(500).optional().nullable(),
  accentColor: z
    .string()
    .regex(/^#([0-9A-Fa-f]{3}){1,2}$/)
    .optional()
    .nullable(),
});

export const accountingPeriodSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(["monthly", "quarterly"]),
});

export const accountingPeriodUpdateSchema = z.object({
  status: z.enum(["open", "closed"]),
});

export const accountingPeriodGenerateSchema = z.object({
  companyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  frequency: z.enum(["monthly", "quarterly"]),
});

export const vatPeriodSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(["monthly", "quarterly"]),
});

export const vatPeriodUpdateSchema = z.object({
  status: z.enum(["open", "filed"]),
});

export const vatPeriodGenerateSchema = z.object({
  companyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  frequency: z.enum(["monthly", "quarterly"]),
});

export const vatAdjustmentSchema = z.object({
  companyId: z.string().min(1),
  periodId: z.string().min(1),
  type: z.enum(["output", "input"]),
  amount: z.number().min(0),
  reason: z.string().min(2),
});
