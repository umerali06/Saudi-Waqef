import { z } from "zod";

export const leaveTypeSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  code: z.string().min(2),
  isPaid: z.boolean(),
  defaultAllowance: z.number().min(0).max(365),
  requiresApproval: z.boolean(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const leaveTypeUpdateSchema = leaveTypeSchema.partial();

export const leaveRequestSchema = z.object({
  companyId: z.string().min(1),
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional().nullable(),
});

export const leaveRequestUpdateSchema = z.object({
  companyId: z.string().min(1),
  status: z.enum(["approved", "rejected", "cancelled"]),
  reason: z.string().optional().nullable(),
});

export const leaveAdjustmentSchema = z.object({
  companyId: z.string().min(1),
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  amount: z.number().min(-365).max(365),
  reason: z.string().min(2),
});
