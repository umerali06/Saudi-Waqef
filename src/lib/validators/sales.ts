import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const invoiceLineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  discountRate: z.number().min(0).max(100).optional().default(0),
  taxCategoryId: z.string().optional().nullable(),
});

export const invoiceSchema = z.object({
  companyId: z.string().min(1),
  customerId: z.string().min(1),
  invoiceDate: dateSchema,
  dueDate: dateSchema,
  currency: z.string().optional().nullable(),
  paymentTermId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  status: z.enum(["draft", "approved", "sent"]).optional(),
  lines: z.array(invoiceLineSchema).min(1),
});

export const invoiceUpdateSchema = z.object({
  customerId: z.string().min(1).optional(),
  invoiceDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  currency: z.string().optional().nullable(),
  paymentTermId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  lines: z.array(invoiceLineSchema).min(1).optional(),
});

export const invoiceStatusSchema = z.object({
  companyId: z.string().min(1),
  status: z.enum([
    "draft",
    "approved",
    "sent",
    "partially_paid",
    "paid",
    "canceled",
  ]),
});

export const invoicePaymentSchema = z.object({
  companyId: z.string().min(1),
  paymentDate: dateSchema,
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional().nullable(),
  accountId: z.string().min(1),
});

export const invoiceAttachmentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});

export const creditNoteLineSchema = z.object({
  id: z.string().optional(),
  invoiceLineId: z.string().optional().nullable(),
  itemId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  discountRate: z.number().min(0).max(100).optional().default(0),
  taxCategoryId: z.string().optional().nullable(),
  restock: z.boolean().optional(),
});

export const creditNoteSchema = z.object({
  companyId: z.string().min(1),
  invoiceId: z.string().min(1),
  issueDate: dateSchema,
  currency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(["draft", "issued", "canceled"]).optional(),
  lines: z.array(creditNoteLineSchema).min(1),
});

export const creditNoteUpdateSchema = z.object({
  issueDate: dateSchema.optional(),
  notes: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(["draft", "issued", "canceled"]).optional(),
  lines: z.array(creditNoteLineSchema).min(1).optional(),
});

// Debit notes use the same editable fields and line validation as credit notes.
export const debitNoteLineSchema = creditNoteLineSchema;
export const debitNoteSchema = creditNoteSchema;
export const debitNoteUpdateSchema = creditNoteUpdateSchema;
