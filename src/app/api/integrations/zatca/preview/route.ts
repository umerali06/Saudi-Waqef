import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getCompanyById } from "@/lib/data/companies";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { listIntegrations, type IntegrationRecord } from "@/lib/data/integrations";
import { buildZatcaXml, signZatcaDocument } from "@/lib/integrations/zatca/document";
import { mapSalesInvoiceToZatca, resolveZatcaCredentials } from "@/lib/integrations/zatca/service";

export const runtime = "nodejs";

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Read-only preview of the real ZATCA pipeline (no fake hash/QR, no
 * persistence side effects). Works even before onboarding is complete --
 * `authoritative: false` marks previews that used an unsigned placeholder
 * hash because no real signing credentials exist yet.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const invoiceId = searchParams.get("invoiceId");
  if (!companyId || !invoiceId) {
    return NextResponse.json({ error: "companyId and invoiceId are required" }, { status: 400 });
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

  const integrations = await listIntegrations(companyId);
  const zatcaIntegration: IntegrationRecord =
    integrations.find((integration) => integration.connector === "zatca") ?? {
      id: "preview",
      companyId,
      name: "ZATCA e-Invoicing",
      connector: "zatca",
      status: "inactive",
      environment: "sandbox",
      config: {},
      credentials: {},
      createdAt: new Date(),
    };

  let document: Awaited<ReturnType<typeof mapSalesInvoiceToZatca>>;
  try {
    document = await mapSalesInvoiceToZatca({ integration: zatcaIntegration, invoice, chain: null });
  } catch (error) {
    // Missing seller/buyer data is a setup problem to show, not a server fault.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed" },
      { status: 422 }
    );
  }

  const { privateKeyPem, certificate } = resolveZatcaCredentials(zatcaIntegration);
  const signingCertificate = certificate || text(zatcaIntegration.credentials?.complianceToken);
  if (privateKeyPem && signingCertificate) {
    const signed = signZatcaDocument({ document, privateKeyPem, certificate: signingCertificate });
    return NextResponse.json({
      authoritative: true,
      uuid: document.uuid,
      invoiceHash: signed.invoiceHash,
      qr: signed.qr,
      document,
      totals: signed.totals,
    });
  }

  return NextResponse.json({
    authoritative: false,
    note: "Complete ZATCA onboarding to see the final signed hash and QR code. This is an unsigned preview only.",
    uuid: document.uuid,
    invoiceHash: crypto.createHash("sha256").update(buildZatcaXml(document)).digest("base64"),
    document,
  });
}
