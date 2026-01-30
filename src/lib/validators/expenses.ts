import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const expenseCategorySchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  expenseAccountId: z.string().min(1),
  status: z.enum(["active", "inactive"]).optional(),
});

export const expenseCategoryUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  expenseAccountId: z.string().min(1).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const expenseSchema = z.object({
  companyId: z.string().min(1),
  expenseDate: dateSchema,
  categoryId: z.string().min(1),
  vendorId: z.string().optional().nullable(),
  paymentMethod: z.enum(["cash", "bank", "card", "cheque", "online", "other"]),
  paymentAccountId: z.string().optional().nullable(),
  taxCategoryId: z.string().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "approved"]).optional(),
  reimbursable: z.boolean().optional(),
  reimbursementStatus: z.enum(["pending", "paid"]).optional().nullable(),
  reimburseTo: z.string().optional().nullable(),
});

export const expenseUpdateSchema = z.object({
  expenseDate: dateSchema.optional(),
  categoryId: z.string().min(1).optional(),
  vendorId: z.string().optional().nullable(),
  paymentMethod: z.enum(["cash", "bank", "card", "cheque", "online", "other"]).optional(),
  paymentAccountId: z.string().optional().nullable(),
  taxCategoryId: z.string().optional().nullable(),
  amount: z.number().positive().optional(),
  currency: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reimbursable: z.boolean().optional(),
  reimbursementStatus: z.enum(["pending", "paid"]).optional().nullable(),
  reimburseTo: z.string().optional().nullable(),
});

export const expenseAttachmentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});

export const expenseReimbursementSchema = z.object({
  companyId: z.string().min(1),
  paymentDate: dateSchema,
  paymentMethod: z.enum(["cash", "bank", "card", "cheque", "online", "other"]),
  paymentAccountId: z.string().min(1),
  reference: z.string().optional().nullable(),
});
