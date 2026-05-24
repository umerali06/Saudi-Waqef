import { z } from "zod";

const optionalString = z.string().optional().nullable();
const optionalTerminationCategory = z
  .enum([
    "employer_termination",
    "resignation",
    "contract_end",
    "force_majeure",
    "retirement",
    "other",
  ])
  .optional()
  .nullable();

const departmentBaseSchema = z.object({
  companyId: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().min(2),
  code: optionalString,
  managerId: optionalString,
  status: z.enum(["active", "inactive"]).optional(),
  notes: optionalString,
});

export const departmentSchema = departmentBaseSchema;
export const departmentUpdateSchema = departmentBaseSchema.partial();

const positionBaseSchema = z.object({
  companyId: z.string().min(1),
  nameAr: z.string().min(2),
  nameEn: z.string().min(2),
  code: optionalString,
  departmentId: optionalString,
  status: z.enum(["active", "inactive"]).optional(),
  notes: optionalString,
});

export const positionSchema = positionBaseSchema;
export const positionUpdateSchema = positionBaseSchema.partial();

const onboardingTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  completed: z.boolean().optional(),
  completedAt: optionalString,
  completedBy: optionalString,
});

const employeeBaseSchema = z.object({
  companyId: z.string().min(1),
  employeeNumber: optionalString,
  nameAr: z.string().min(2),
  nameEn: z.string().min(2),
  nationalId: optionalString,
  iqamaNumber: optionalString,
  passportNumber: optionalString,
  nationality: optionalString,
  dob: optionalString,
  gender: z.enum(["male", "female"]).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: optionalString,
  address: optionalString,
  hireDate: optionalString,
  departmentId: optionalString,
  positionId: optionalString,
  managerId: optionalString,
  userId: optionalString,
  employmentType: z
    .enum(["full_time", "part_time", "contractor", "temporary"])
    .optional()
    .nullable(),
  status: z.enum(["active", "suspended", "terminated"]).optional(),
  terminationDate: optionalString,
  terminationCategory: optionalTerminationCategory,
  terminationReason: optionalString,
  notes: optionalString,
  onboarding: z.array(onboardingTaskSchema).optional(),
});

const refineEmployee = (
  data: Partial<z.infer<typeof employeeBaseSchema>>,
  ctx: z.RefinementCtx
) => {
  if (data.status === "terminated" && !data.terminationDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Termination date required",
      path: ["terminationDate"],
    });
  }
  if (data.status === "terminated" && !data.terminationCategory) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Termination category required",
      path: ["terminationCategory"],
    });
  }
};

export const employeeSchema = employeeBaseSchema.superRefine(refineEmployee);

export const employeeUpdateSchema = employeeBaseSchema
  .partial()
  .extend({
    companyId: z.string().min(1),
    transferEffectiveDate: optionalString,
    transferReason: optionalString,
  })
  .superRefine(refineEmployee);

export const employeeSelfUpdateSchema = z.object({
  companyId: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: optionalString,
  address: optionalString,
});

const contractBaseSchema = z.object({
  companyId: z.string().min(1),
  type: z.enum(["full_time", "part_time", "temporary", "contractor"]),
  status: z.enum(["draft", "active", "ended"]),
  startDate: optionalString,
  endDate: optionalString,
  probationEndDate: optionalString,
  salary: z.object({
    basic: z.number().min(0),
    housingAllowance: z.number().min(0),
    transportAllowance: z.number().min(0),
    otherAllowance: z.number().min(0),
    deductions: z.number().min(0),
    currency: optionalString,
  }),
  notes: optionalString,
});

export const contractSchema = contractBaseSchema;
export const contractUpdateSchema = contractBaseSchema.partial();

export const documentSchema = z.object({
  companyId: z.string().min(1),
  type: z.enum(["id", "contract", "certificate", "other"]),
  name: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().min(0),
  storage: z.enum(["cloudinary", "firestore"]),
  url: z.string().url().optional().nullable(),
  content: z.string().optional().nullable(),
  issuedAt: optionalString,
  expiresAt: optionalString,
});
