import { z } from "zod";

export const payrollSettingsSchema = z.object({
  companyId: z.string().min(1),
  cycle: z.enum(["monthly"]).optional(),
  overtimeMultiplier: z.number().min(1).max(5),
  latenessPenaltyPerMinute: z.number().min(0).max(1000),
  gosiEnabled: z.boolean().optional(),
  gosiEmployeeRate: z.number().min(0).max(100).optional(),
  gosiEmployerRate: z.number().min(0).max(100).optional(),
  incomeTaxEnabled: z.boolean().optional(),
  incomeTaxRate: z.number().min(0).max(100).optional(),
  salaryExpenseAccountId: z.string().optional().nullable(),
  payrollPayableAccountId: z.string().optional().nullable(),
  salaryDeductionsAccountId: z.string().optional().nullable(),
  paymentAccountId: z.string().optional().nullable(),
});

export const payrollSettingsUpdateSchema = payrollSettingsSchema.partial();

export const payrollRunCreateSchema = z.object({
  companyId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeIds: z.array(z.string()).optional(),
});

export const payrollRunPaySchema = z.object({
  companyId: z.string().min(1),
  paymentAccountId: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

export const payrollAdjustmentSchema = z.object({
  companyId: z.string().min(1),
  runId: z.string().min(1),
  runItemId: z.string().min(1),
  amount: z.number().min(-1000000).max(1000000),
  reason: z.string().min(2),
});
