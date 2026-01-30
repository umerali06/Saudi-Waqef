import { z } from "zod";

export const billingPlanSchema = z.object({
  companyId: z.string().min(1),
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional().nullable(),
  currency: z.string().min(1),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  maxUsers: z.number().int().min(1),
  maxCompanies: z.number().int().min(1).optional().nullable(),
  modules: z.array(z.string()).optional(),
  trialDays: z.number().int().min(0).max(365),
  graceDays: z.number().int().min(0).max(365),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const billingPlanUpdateSchema = billingPlanSchema
  .omit({ companyId: true, code: true })
  .partial();

export const subscriptionUpdateSchema = z.object({
  companyId: z.string().min(1),
  planId: z.string().min(1),
  billingCycle: z.enum(["monthly", "yearly"]),
});

export const subscriptionCancelSchema = z.object({
  companyId: z.string().min(1),
  cancelAtPeriodEnd: z.boolean().optional(),
});

export const subscriptionReactivateSchema = z.object({
  companyId: z.string().min(1),
});

export const subscriptionOverrideSchema = z.object({
  companyId: z.string().min(1),
  status: z.enum(["trialing", "active", "past_due", "canceled", "suspended"]),
});

export const billingInvoiceCreateSchema = z.object({
  companyId: z.string().min(1),
  subscriptionId: z.string().min(1),
  planId: z.string().min(1),
  planName: z.string().min(1),
  amount: z.number().min(0),
  currency: z.string().min(1),
  status: z.enum(["draft", "issued", "paid", "overdue", "failed", "void"]),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

export const billingInvoiceUpdateSchema = z.object({
  companyId: z.string().min(1),
  status: z.enum(["draft", "issued", "paid", "overdue", "failed", "void"]),
});

export const paymentMethodSchema = z.object({
  companyId: z.string().min(1),
  type: z.enum(["card", "bank"]),
  brand: z.string().optional().nullable(),
  last4: z.string().length(4),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2020).max(2100).optional().nullable(),
  token: z.string().min(6),
  isDefault: z.boolean().optional(),
});

export const paymentMethodUpdateSchema = z.object({
  companyId: z.string().min(1),
  isDefault: z.boolean(),
});
