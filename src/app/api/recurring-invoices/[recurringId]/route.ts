import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import {
  getRecurringInvoice,
  updateRecurringInvoice,
  deleteRecurringInvoice,
} from "@/lib/data/recurring-invoices";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["active", "paused"]).optional(),
  nextRunDate: z.string().min(10).optional(),
  frequency: z.enum(["weekly", "monthly"]).optional(),
  template: z
    .object({
      invoiceDateOffsetDays: z.number().min(0),
      dueDays: z.number().min(0),
      paymentTermId: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      terms: z.string().optional().nullable(),
      lines: z.array(
        z.object({
          id: z.string().optional(),
          itemId: z.string().min(1),
          description: z.string().min(1),
          quantity: z.number().positive(),
          unit: z.string().min(1),
          unitPrice: z.number().nonnegative(),
          discountRate: z.number().min(0).max(100).optional(),
          taxCategoryId: z.string().optional().nullable(),
        })
      ),
    })
    .optional(),
});

type RouteContext = {
  params: Promise<{ recurringId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recurringId } = await context.params;
  const recurring = await getRecurringInvoice(recurringId);
  if (!recurring) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, recurring.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ recurring });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recurringId } = await context.params;
  const recurring = await getRecurringInvoice(recurringId);
  if (!recurring) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, recurring.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateRecurringInvoice(recurringId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { recurringId } = await context.params;
  const recurring = await getRecurringInvoice(recurringId);
  if (!recurring) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireCompanyRole(user.id, recurring.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteRecurringInvoice(recurringId);
  return NextResponse.json({ ok: true });
}
