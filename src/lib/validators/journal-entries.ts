import { z } from "zod";

const journalLineSchema = z
  .object({
    accountId: z.string().min(1),
    debit: z.number().min(0),
    credit: z.number().min(0),
  })
  .refine((line) => {
    const debitPositive = line.debit > 0;
    const creditPositive = line.credit > 0;
    return debitPositive !== creditPositive;
  }, {
    message: "Invalid line amount",
    path: ["debit"],
  });

const ensureBalanced = (
  data: { lines: { debit: number; credit: number }[] },
  ctx: z.RefinementCtx
) => {
  const totalDebit = data.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = data.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Unbalanced entry",
      path: ["lines"],
    });
  }
};

export const manualJournalEntrySchema = z
  .object({
    companyId: z.string().min(1),
    date: z.string().min(1),
    memo: z.string().optional().nullable(),
    lines: z.array(journalLineSchema).min(2),
    status: z.enum(["draft", "posted"]).optional(),
    isAdjusting: z.boolean().optional(),
  })
  .superRefine(ensureBalanced);

export const manualJournalEntryUpdateSchema = z
  .object({
    companyId: z.string().min(1),
    date: z.string().optional(),
    memo: z.string().optional().nullable(),
    lines: z.array(journalLineSchema).min(2).optional(),
    status: z.enum(["draft", "posted", "void"]).optional(),
    isAdjusting: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lines) {
      ensureBalanced({ lines: data.lines }, ctx);
    }
  });
