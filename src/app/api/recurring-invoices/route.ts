import { NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listRecurringInvoices, createRecurringInvoice } from "@/lib/data/recurring-invoices";
import { getCustomerById } from "@/lib/data/customers";

export const runtime = "nodejs";

const lineSchema = z.object({
  id: z.string().optional(),
  itemId: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  discountRate: z.number().min(0).max(100).optional(),
  taxCategoryId: z.string().optional().nullable(),
});

const schema = z.object({
  companyId: z.string().min(1),
  customerId: z.string().min(1),
  frequency: z.enum(["weekly", "monthly"]),
  nextRunDate: z.string().min(10),
  template: z.object({
    invoiceDateOffsetDays: z.number().min(0),
    dueDays: z.number().min(0),
    paymentTermId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    terms: z.string().optional().nullable(),
    lines: z.array(lineSchema).min(1),
  }),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await listRecurringInvoices(companyId);
  return NextResponse.json({ recurring: items });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const customer = await getCustomerById(parsed.data.customerId);
  if (!customer || customer.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }

  const id = await createRecurringInvoice({
    companyId: parsed.data.companyId,
    customerId: customer.id,
    customerName: customer.name,
    currency: customer.currency ?? "SAR",
    frequency: parsed.data.frequency,
    nextRunDate: parsed.data.nextRunDate,
    template: {
      ...parsed.data.template,
      lines: parsed.data.template.lines.map((l) => ({
        ...l,
        id: l.id ?? uuidv4(),
      })),
    },
  });

  return NextResponse.json({ recurringId: id });
}
