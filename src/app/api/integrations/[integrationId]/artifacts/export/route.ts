import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";
import { listSalesInvoices } from "@/lib/data/sales-invoices";
import { redactSecrets } from "@/lib/security/redact";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const escapeCsv = (value: unknown) => {
  let text = String(value ?? "");
  // Neutralize spreadsheet formula injection before quoting.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const query = url.searchParams;

  const [artifacts, invoices] = await Promise.all([
    listZatcaArtifactsByCompany(integration.companyId, 1000),
    listSalesInvoices(integration.companyId),
  ]);
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  const filtered = artifacts.filter((artifact) => {
    const day = artifact.createdAt.toISOString().slice(0, 10);
    return (
      (!query.get("from") || day >= query.get("from")!) &&
      (!query.get("to") || day <= query.get("to")!) &&
      (!query.get("status") || artifact.status === query.get("status")) &&
      (!query.get("documentType") || artifact.documentType === query.get("documentType")) &&
      (!query.get("environment") || artifact.environment === query.get("environment")) &&
      (!query.get("operation") || artifact.operation === query.get("operation"))
    );
  });

  const rows = filtered.map((artifact) => {
    const invoice = invoiceMap.get(artifact.invoiceId);
    const document = artifact.payload.document as Record<string, unknown> | undefined;
    const documentType =
      artifact.documentType ?? (document?.profileId === "reporting:1.0" ? "simplified" : "standard");
    const operation =
      artifact.operation ?? (document?.profileId === "reporting:1.0" ? "reporting" : "clearance");
    const response = redactSecrets(artifact.lastResponse ?? null) as Record<string, unknown> | null;
    return {
      artifactId: artifact.id,
      invoiceId: artifact.invoiceId,
      invoiceNumber: invoice?.invoiceNumber ?? String(document?.invoiceNumber ?? ""),
      customerName: invoice?.customerName ?? "",
      uuid: artifact.uuid,
      documentType,
      environment: artifact.environment ?? integration.environment,
      operation,
      status: artifact.status ?? "pending",
      technicalStatus: artifact.technicalStatus ?? "",
      providerReference: artifact.providerReference ?? "",
      lastSubmittedAt: artifact.lastSubmittedAt ? artifact.lastSubmittedAt.toISOString() : "",
      createdAt: artifact.createdAt.toISOString(),
      response,
    };
  });

  await recordAuditEvent({
    companyId: integration.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "integration.zatca.logs.export",
    entity: "integration",
    entityId: integration.id,
    metadata: { format, rows: rows.length },
  });

  if (format === "json") {
    return NextResponse.json({ artifacts: rows });
  }

  const headers = [
    "artifactId",
    "invoiceId",
    "invoiceNumber",
    "customerName",
    "uuid",
    "documentType",
    "environment",
    "operation",
    "status",
    "technicalStatus",
    "providerReference",
    "lastSubmittedAt",
    "createdAt",
    "responseMessage",
  ];

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.artifactId,
        row.invoiceId,
        row.invoiceNumber,
        row.customerName,
        row.uuid,
        row.documentType,
        row.environment,
        row.operation,
        row.status,
        row.technicalStatus,
        row.providerReference,
        row.lastSubmittedAt,
        row.createdAt,
        (row.response?.message as string | undefined) ?? "",
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ].join("\n");

  // BOM so Excel renders Arabic customer names correctly.
  return new NextResponse(`﻿${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="integration-${integrationId}-artifacts.csv"`,
    },
  });
}
