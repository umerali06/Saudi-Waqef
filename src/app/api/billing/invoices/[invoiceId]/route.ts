import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { billingInvoiceUpdateSchema } from "@/lib/validators/billing";
import { getBillingInvoiceById, updateBillingInvoice } from "@/lib/data/billing-invoices";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = billingInvoiceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { invoiceId } = await context.params;
  const invoice = await getBillingInvoiceById(invoiceId);
  if (!invoice || invoice.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const now = new Date();
  const isPaid = parsed.data.status === "paid";
  await updateBillingInvoice(invoiceId, {
    status: parsed.data.status,
    paidAt: isPaid ? now : null,
  });

  if (parsed.data.status === "paid") {
    await notifyCompanyRoles({
      companyId: parsed.data.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "subscription_payment_success",
      actorId: access.user?.id ?? null,
      data: {
        invoiceNumber: invoice.id,
        amount: `${invoice.amount}`,
        currency: invoice.currency ?? "SAR",
      },
    });
  }
  if (parsed.data.status === "failed") {
    await notifyCompanyRoles({
      companyId: parsed.data.companyId,
      roles: ["owner", "admin", "accountant"],
      type: "subscription_payment_failed",
      actorId: access.user?.id ?? null,
      data: {
        invoiceNumber: invoice.id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

