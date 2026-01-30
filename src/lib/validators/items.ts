import { z } from "zod";

const optionalString = z.string().optional().nullable();

const itemBaseSchema = z.object({
  companyId: z.string().min(1),
  type: z.enum(["product", "service"]),
  name: z.string().min(2),
  sku: optionalString,
  barcode: optionalString,
  category: optionalString,
  brand: optionalString,
  descriptionAr: optionalString,
  descriptionEn: optionalString,
  baseUnit: z.string().min(1),
  packUnit: optionalString,
  packSize: z.number().int().min(1).optional().nullable(),
  salePrice: z.number().min(0).optional().nullable(),
  purchasePrice: z.number().min(0).optional().nullable(),
  taxCategoryId: optionalString,
  incomeAccountId: optionalString,
  expenseAccountId: optionalString,
  trackInventory: z.boolean().optional(),
  minStock: z.number().min(0).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
  tags: z.array(z.string()).optional(),
});

const refineItem = (
  data: z.infer<typeof itemBaseSchema>,
  ctx: z.RefinementCtx
) => {
  if (data.type === "service") {
    if (data.trackInventory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Services cannot track inventory",
        path: ["trackInventory"],
      });
    }
    if (data.packUnit || data.packSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Services cannot use pack units",
        path: ["packUnit"],
      });
    }
  }
  if (data.packUnit && !data.packSize) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pack size required",
      path: ["packSize"],
    });
  }
  if (data.packSize && !data.packUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Pack unit required",
      path: ["packUnit"],
    });
  }
};

export const itemSchema = itemBaseSchema.superRefine(refineItem);

export const itemUpdateSchema = itemBaseSchema
  .partial()
  .extend({
    companyId: z.string().min(1),
  })
  .superRefine(refineItem);

export const itemBulkStatusSchema = z.object({
  companyId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(["active", "inactive"]),
});

export const itemAttachmentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});

export const inventoryAdjustmentSchema = z.object({
  companyId: z.string().min(1),
  quantity: z.number().min(-1000000).max(1000000),
  unit: z.string().min(1),
  reason: z.enum(["opening", "damage", "count", "other"]),
  note: optionalString,
});

export const itemImportSchema = z.object({
  companyId: z.string().min(1),
  csv: z.string().min(1),
  dryRun: z.boolean().optional(),
});
