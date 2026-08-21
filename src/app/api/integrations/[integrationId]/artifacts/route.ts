import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { redactSecrets } from "@/lib/security/redact";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { integrationId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAdminAccess(user.id, integration.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [artifacts, invoices] = await Promise.all([listZatcaArtifactsByCompany(integration.companyId, 500), listSalesInvoices(integration.companyId)]);
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const query = new URL(request.url).searchParams;
  const filtered = artifacts.filter((artifact) => {
    const day = artifact.createdAt.toISOString().slice(0, 10);
    return (!query.get("from") || day >= query.get("from")!) && (!query.get("to") || day <= query.get("to")!) &&
      (!query.get("status") || artifact.status === query.get("status")) && (!query.get("documentType") || artifact.documentType === query.get("documentType")) &&
      (!query.get("environment") || artifact.environment === query.get("environment")) && (!query.get("operation") || artifact.operation === query.get("operation"));
  });
  return NextResponse.json({
    artifacts: filtered.map((artifact) => {
      const invoice = invoiceMap.get(artifact.invoiceId);
      const document = artifact.payload.document as Record<string, unknown> | undefined;
      return ({
      id: artifact.id,
      invoiceId: artifact.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? String(document?.invoiceNumber ?? ""),
      customerName: invoice?.customerName ?? "",
      uuid: artifact.uuid,
      status: artifact.status ?? "pending",
      technicalStatus: artifact.technicalStatus,
      environment: artifact.environment ?? integration.environment,
      documentType: artifact.documentType ?? (document?.profileId === "reporting:1.0" ? "simplified" : "standard"),
      operation: artifact.operation ?? (document?.profileId === "reporting:1.0" ? "reporting" : "clearance"),
      providerReference: artifact.providerReference ?? null,
      lastSubmittedAt: artifact.lastSubmittedAt ? artifact.lastSubmittedAt.toISOString() : null,
      lastResponse: redactSecrets(artifact.lastResponse ?? null),
      createdAt: artifact.createdAt.toISOString(),
    })}),
  });
}
