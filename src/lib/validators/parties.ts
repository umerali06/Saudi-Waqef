import { z } from "zod";

const vatRegex = /^3\d{13}3$/;

const optionalString = z.string().optional().nullable();

const validateVatNumber = (
  data: { vatRegistered?: boolean; vatNumber?: string | null },
  ctx: z.RefinementCtx
) => {
  const vatNumber = data.vatNumber?.trim() ?? "";
  const vatRegistered = data.vatRegistered ?? Boolean(vatNumber);
  const shouldValidate = Boolean(data.vatRegistered || data.vatNumber);
  if ((vatRegistered || shouldValidate) && !vatRegex.test(vatNumber)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid VAT number",
      path: ["vatNumber"],
    });
  }
};

const customerBaseSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  legalName: optionalString,
  vatRegistered: z.boolean().optional(),
  vatNumber: optionalString,
  crNumber: optionalString,
  email: z.string().email().optional().nullable(),
  phone: optionalString,
  billingAddress: optionalString,
  shippingAddress: optionalString,
  paymentTermId: optionalString,
  creditLimit: z.number().min(0).optional().nullable(),
  currency: optionalString,
  notes: optionalString,
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive", "blacklisted"]).optional(),
});

export const customerSchema = customerBaseSchema.superRefine(validateVatNumber);

export const customerUpdateSchema = customerBaseSchema
  .partial()
  .extend({
    companyId: z.string().min(1),
  })
  .superRefine(validateVatNumber);

const vendorBaseSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  legalName: optionalString,
  vatRegistered: z.boolean().optional(),
  vatNumber: optionalString,
  crNumber: optionalString,
  email: z.string().email().optional().nullable(),
  phone: optionalString,
  remittanceAddress: optionalString,
  paymentTermId: optionalString,
  preferredPaymentMethod: optionalString,
  currency: optionalString,
  notes: optionalString,
  tags: z.array(z.string()).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const vendorSchema = vendorBaseSchema.superRefine(validateVatNumber);

export const vendorUpdateSchema = vendorBaseSchema
  .partial()
  .extend({
    companyId: z.string().min(1),
  })
  .superRefine(validateVatNumber);

export const contactSchema = z.object({
  companyId: z.string().min(1),
  partyType: z.enum(["customer", "vendor"]),
  partyId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional().nullable(),
  phone: optionalString,
  role: optionalString,
  isPrimary: z.boolean().optional(),
});

export const contactUpdateSchema = contactSchema.partial().extend({
  companyId: z.string().min(1),
  partyType: z.enum(["customer", "vendor"]).optional(),
  partyId: z.string().optional(),
});

export const bulkStatusSchema = z.object({
  companyId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["active", "inactive", "blacklisted"]),
});

export const vendorBulkStatusSchema = z.object({
  companyId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["active", "inactive"]),
});

export const importPayloadSchema = z.object({
  companyId: z.string().min(1),
  csv: z.string().min(1),
  dryRun: z.boolean().optional(),
});
