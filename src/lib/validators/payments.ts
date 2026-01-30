import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const cashBankAccountSchema = z.object({
  companyId: z.string().min(1),
  accountId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["cash", "bank"]),
  status: z.enum(["active", "inactive"]).optional(),
  openingBalance: z.number().min(0).optional(),
  bankName: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
});

export const cashBankAccountUpdateSchema = z.object({
  accountId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(["cash", "bank"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  openingBalance: z.number().min(0).optional(),
  bankName: z.string().optional().nullable(),
  iban: z.string().optional().nullable(),
});

export const paymentMethodSchema = z.object({
  companyId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  defaultAccountId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const paymentMethodUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  defaultAccountId: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const receiptAllocationSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
});

export const paymentReceiptSchema = z.object({
  companyId: z.string().min(1),
  receiptDate: dateSchema,
  customerId: z.string().min(1),
  method: z.string().min(1),
  accountId: z.string().min(1),
  reference: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalAmount: z.number().positive(),
  allocations: z.array(receiptAllocationSchema).min(0),
});

export const vendorPaymentAllocationSchema = z.object({
  billId: z.string().min(1),
  amount: z.number().positive(),
});

export const vendorPaymentSchema = z.object({
  companyId: z.string().min(1),
  paymentDate: dateSchema,
  vendorId: z.string().min(1),
  method: z.string().min(1),
  accountId: z.string().min(1),
  reference: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  totalAmount: z.number().positive(),
  allocations: z.array(vendorPaymentAllocationSchema).min(0),
});

export const transferSchema = z.object({
  companyId: z.string().min(1),
  transferDate: dateSchema,
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().positive(),
  reference: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
});

export const adjustmentSchema = z.object({
  companyId: z.string().min(1),
  adjustmentDate: dateSchema,
  accountId: z.string().min(1),
  offsetAccountId: z.string().min(1),
  type: z.enum(["increase", "decrease"]),
  amount: z.number().positive(),
  reason: z.string().optional().nullable(),
  memo: z.string().optional().nullable(),
});

export const reconciliationImportSchema = z.object({
  companyId: z.string().min(1),
  accountId: z.string().min(1),
  lines: z
    .array(
      z.object({
        date: dateSchema,
        description: z.string().min(1),
        amount: z.number(),
      })
    )
    .min(1),
});

export const reconciliationMatchSchema = z.object({
  companyId: z.string().min(1),
  accountId: z.string().min(1),
});
