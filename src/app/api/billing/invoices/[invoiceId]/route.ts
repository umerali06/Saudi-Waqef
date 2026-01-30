import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { billingInvoiceUpdateSchema } from "@/lib/validators/billing";
import { getBillingInvoiceById, updateBillingInvoice } from "@/lib/data/billing-invoices";
import { notifyCompanyRoles } from "@/lib/notifications/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = billingInvoiceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      actorId: user.id,
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
      actorId: user.id,
      data: {
        invoiceNumber: invoice.id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

