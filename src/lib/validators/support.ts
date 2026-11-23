import { z } from "zod";

export const supportTicketSchema = z.object({
  companyId: z.string().min(1),
  subject: z.string().trim().min(3).max(200),
  category: z.enum(["billing", "technical", "data", "access", "onboarding", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  message: z.string().trim().min(5).max(5000),
  locale: z.enum(["ar", "en"]).optional().nullable(),
});

export const supportTicketUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
});

export const supportTicketAdminUpdateSchema = z
  .object({
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    reply: z.string().trim().min(2).max(5000).optional(),
  })
  .refine((data) => data.status !== undefined || data.reply !== undefined);
