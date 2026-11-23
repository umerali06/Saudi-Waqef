import { z } from "zod";

export const JOIN_ROLES = ["admin", "accountant", "hr", "employee", "viewer"] as const;

/** Arabic-Indic and Persian digits typed on a Saudi keyboard become ASCII digits. */
export const toAsciiDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));

/** Returns +9665XXXXXXXX, or null when the number is not a Saudi mobile. */
export const normalizeSaudiMobile = (value: string) => {
  const digits = toAsciiDigits(value).replace(/[\s().-]/g, "");
  const match = digits.match(/^(?:\+966|00966|966|0)?(5\d{8})$/);
  return match ? `+966${match[1]}` : null;
};

export const cleanCompanyName = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[\s;:,.،؛!?؟|/\\_*'"-]+|[\s;:,،؛!?؟|/\\_*'"-]+$/g, "");

/** A real name has at least three letters or digits once punctuation is ignored. */
export const isValidCompanyName = (value: string) =>
  (value.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 3 && value.length <= 160;

const optionalDigits = (pattern: RegExp, message: string) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((value) => toAsciiDigits(value ?? "").replace(/\s/g, "") || null)
    .refine((value) => value === null || pattern.test(value), { message });

const common = {
  name: z.string({ message: "name" }).trim().min(2, "name").max(120, "name"),
  email: z.string({ message: "email" }).trim().email("email").max(200, "email"),
  companyName: z
    .string({ message: "companyName" })
    .transform(cleanCompanyName)
    .refine(isValidCompanyName, { message: "companyName" }),
  locale: z.enum(["ar", "en"]).catch("ar"),
};

export const registrationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("new"),
    ...common,
    phone: z
      .string({ message: "phone" })
      .transform(normalizeSaudiMobile)
      .refine((value): value is string => value !== null, { message: "phone" }),
    crNumber: optionalDigits(/^\d{10}$/, "crNumber"),
    vatNumber: optionalDigits(/^3\d{13}3$/, "vatNumber"),
  }),
  z.object({
    kind: z.literal("join"),
    ...common,
    requestedRole: z.enum(JOIN_ROLES, { message: "requestedRole" }),
  }),
]);

export type RegistrationInput = z.infer<typeof registrationSchema>;

export const registrationErrorFields = (error: z.ZodError) =>
  Array.from(new Set(error.issues.map((issue) => String(issue.path[0] ?? "kind"))));
