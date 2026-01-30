import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const billLineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  discountRate: z.number().min(0).max(100).optional().default(0),
  taxCategoryId: z.string().optional().nullable(),
});

export const billSchema = z.object({
  companyId: z.string().min(1),
  vendorId: z.string().min(1),
  billDate: dateSchema,
  dueDate: dateSchema,
  currency: z.string().optional().nullable(),
  paymentTermId: z.string().optional().nullable(),
  vendorBillNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "approved"]).optional(),
  lines: z.array(billLineSchema).min(1),
});

export const billUpdateSchema = z.object({
  vendorId: z.string().min(1).optional(),
  billDate: dateSchema.optional(),
  dueDate: dateSchema.optional(),
  currency: z.string().optional().nullable(),
  paymentTermId: z.string().optional().nullable(),
  vendorBillNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(billLineSchema).min(1).optional(),
});

export const billPaymentSchema = z.object({
  companyId: z.string().min(1),
  paymentDate: dateSchema,
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional().nullable(),
  accountId: z.string().min(1),
});

export const billAttachmentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});

export const vendorCreditNoteLineSchema = z.object({
  id: z.string().optional(),
  billLineId: z.string().optional().nullable(),
  itemId: z.string().optional().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().min(0),
  discountRate: z.number().min(0).max(100).optional().default(0),
  taxCategoryId: z.string().optional().nullable(),
  returnToVendor: z.boolean().optional(),
});

export const vendorCreditNoteSchema = z.object({
  companyId: z.string().min(1),
  billId: z.string().min(1),
  issueDate: dateSchema,
  currency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(["draft", "issued", "canceled"]).optional(),
  lines: z.array(vendorCreditNoteLineSchema).min(1),
});

export const vendorCreditNoteUpdateSchema = z.object({
  issueDate: dateSchema.optional(),
  notes: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  status: z.enum(["draft", "issued", "canceled"]).optional(),
  lines: z.array(vendorCreditNoteLineSchema).min(1).optional(),
});
