import { z } from "zod";
import { getPasswordIssues } from "@/lib/security/password-policy";

const passwordSchema = z.string().superRefine((value, ctx) => {
  const issues = getPasswordIssues(value);
  if (issues.length === 0) {
    return;
  }
  issues.forEach((issue) => {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `auth.password.rule.${issue}`,
    });
  });
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  otp: z.string().trim().optional(),
});

export const bootstrapSchema = z.object({
  companyName: z.string().min(2),
  adminName: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
});

export const createCompanySchema = z.object({
  name: z.string().min(2),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "accountant", "hr", "employee", "viewer"]),
  companyId: z.string().min(1),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().min(2),
  password: passwordSchema,
});
