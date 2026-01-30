import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

export const attendanceSettingsSchema = z.object({
  companyId: z.string().min(1),
  shiftStart: z.string().regex(timeRegex),
  shiftEnd: z.string().regex(timeRegex),
  weekendDays: z.array(z.number().int().min(0).max(6)).min(0),
  graceMinutes: z.number().int().min(0).max(120),
  roundingMinutes: z.number().int().min(0).max(60),
  overtimeThresholdMinutes: z.number().int().min(0).max(600),
});

export const attendanceSettingsUpdateSchema = attendanceSettingsSchema.partial();

export const attendanceHolidaySchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isPaid: z.boolean().optional(),
});

export const attendanceHolidayUpdateSchema = attendanceHolidaySchema.partial();

export const attendanceRecordSchema = z.object({
  companyId: z.string().min(1),
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string().regex(timeRegex).optional().nullable(),
  checkOut: z.string().regex(timeRegex).optional().nullable(),
  status: z.enum(["present", "late", "absent", "leave", "holiday"]).optional(),
  source: z.enum(["manual", "import", "self"]).optional(),
  notes: z.string().optional().nullable(),
});

export const attendanceRecordUpdateSchema = attendanceRecordSchema.partial();

export const attendanceImportSchema = z.object({
  companyId: z.string().min(1),
  csv: z.string().min(1),
});
