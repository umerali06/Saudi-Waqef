import { z } from "zod";

export const documentSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  docType: z.enum(["invoice", "receipt", "contract", "id", "general"]),
  tags: z.array(z.string()).optional().default([]),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});

export const documentUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  docType: z.enum(["invoice", "receipt", "contract", "id", "general"]).optional(),
  tags: z.array(z.string()).optional(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
});

export const documentReplaceSchema = z.object({
  companyId: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
});
