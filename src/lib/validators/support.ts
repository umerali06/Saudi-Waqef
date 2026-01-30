import { z } from "zod";

export const supportTicketSchema = z.object({
  companyId: z.string().min(1),
  subject: z.string().min(3),
  category: z.enum(["billing", "technical", "data", "access", "onboarding", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  message: z.string().min(5),
  locale: z.enum(["ar", "en"]).optional().nullable(),
});

export const supportTicketUpdateSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
});
