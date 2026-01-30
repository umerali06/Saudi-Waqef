import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getCompanyById } from "@/lib/data/companies";
import { getCustomerById } from "@/lib/data/customers";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import {
  createZatcaArtifact,
  getZatcaArtifactByInvoiceId,
} from "@/lib/data/zatca-artifacts";
import { mapInvoiceToZatcaDraft } from "@/lib/integrations/zatca/mapping";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const invoiceId = searchParams.get("invoiceId");
  if (!companyId || !invoiceId) {
    return NextResponse.json(
      { error: "companyId and invoiceId are required" },
      { status: 400 }
    );
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invoice = await getSalesInvoiceById(invoiceId);
  if (!invoice || invoice.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const company = await getCompanyById(companyId);
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const customer = invoice.customerId
    ? await getCustomerById(invoice.customerId)
    : null;

  const existingArtifact = await getZatcaArtifactByInvoiceId(invoiceId);
  const uuid = existingArtifact?.uuid ?? crypto.randomUUID();
  const draft = mapInvoiceToZatcaDraft({ uuid, invoice, company, customer });

  let artifactId = existingArtifact?.id ?? null;
  if (!existingArtifact) {
    artifactId = await createZatcaArtifact({
      companyId,
      invoiceId,
      uuid: draft.uuid,
      hash: draft.hash,
      qr: draft.qr,
      payload: draft,
    });
  }

  return NextResponse.json({
    artifactId,
    draft,
    artifact: existingArtifact
      ? {
          ...existingArtifact,
          createdAt: existingArtifact.createdAt.toISOString(),
        }
      : null,
  });
}

