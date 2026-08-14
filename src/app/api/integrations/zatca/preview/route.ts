import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  extractCertificateSignature,
  extractRawPublicKey,
  generateInvoiceXml,
  generatePhase2TLV,
  signInvoice,
  type HashChainState,
} from "@talha7k/zatca";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getCompanyById } from "@/lib/data/companies";
import { getSalesInvoiceById } from "@/lib/data/sales-invoices";
import { listIntegrations, type IntegrationRecord } from "@/lib/data/integrations";
import { mapSalesInvoiceToZatca } from "@/lib/integrations/zatca/service";

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

  const emptyChain: HashChainState = {
    lastHash: "",
    lastUuid: "",
    counter: 0,
    updatedAt: new Date().toISOString(),
  };
  const document = await mapSalesInvoiceToZatca({
    integration: zatcaIntegration,
    invoice,
    chain: emptyChain,
  });
  const xml = generateInvoiceXml(document);

  const credentials = zatcaIntegration.credentials ?? {};
  const privateKeyPem = text(credentials.privateKeyPem);
  const certificatePem = text(credentials.certificatePem) || text(credentials.complianceCertificatePem);

  if (privateKeyPem && certificatePem) {
    const timestamp = `${document.issueDate}T${document.issueTime}Z`;
    const signed = signInvoice({
      xml,
      privateKeyPem,
      certificatePem,
      qrData: {
        sellerName: document.supplier.nameEn,
        vatNumber: document.supplier.vatNumber,
        timestamp,
        totalWithVat: document.taxInclusiveAmount.toFixed(2),
        vatTotal: document.taxAmount.toFixed(2),
        certificateSignature: extractCertificateSignature(certificatePem),
      },
    });
    const qr = generatePhase2TLV({
      sellerName: document.supplier.nameEn,
      vatNumber: document.supplier.vatNumber,
      timestamp,
      totalWithVat: document.taxInclusiveAmount.toFixed(2),
      vatTotal: document.taxAmount.toFixed(2),
      invoiceHash: signed.invoiceHash,
      signatureValue: signed.signatureValue,
      publicKey: extractRawPublicKey(certificatePem),
      certificateSignature: extractCertificateSignature(certificatePem),
    });
    return NextResponse.json({
      authoritative: true,
      uuid: document.uuid,
      invoiceHash: signed.invoiceHash,
      qr,
      document,
    });
  }

  const unsignedHash = crypto.createHash("sha256").update(xml).digest("hex");
  return NextResponse.json({
    authoritative: false,
    note: "Complete ZATCA onboarding to see the final signed hash and QR code. This is an unsigned preview only.",
    uuid: document.uuid,
    invoiceHash: unsignedHash,
    document,
  });
}
