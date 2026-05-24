import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listZatcaArtifactsByCompany } from "@/lib/data/zatca-artifacts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
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
  const artifacts = await listZatcaArtifactsByCompany(integration.companyId, 1000);

  if (format === "json") {
    return NextResponse.json({
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        invoiceId: artifact.invoiceId,
        uuid: artifact.uuid,
        status: artifact.status ?? "pending",
        providerReference: artifact.providerReference ?? null,
        lastSubmittedAt: artifact.lastSubmittedAt ? artifact.lastSubmittedAt.toISOString() : null,
        createdAt: artifact.createdAt.toISOString(),
        lastResponse: artifact.lastResponse ?? null,
      })),
    });
  }

  const headers = [
    "artifactId",
    "invoiceId",
    "uuid",
    "status",
    "providerReference",
    "lastSubmittedAt",
    "createdAt",
    "responseMessage",
  ];

  const rows = artifacts.map((artifact) => [
    artifact.id,
    artifact.invoiceId,
    artifact.uuid,
    artifact.status ?? "pending",
    artifact.providerReference ?? "",
    artifact.lastSubmittedAt ? artifact.lastSubmittedAt.toISOString() : "",
    artifact.createdAt.toISOString(),
    (artifact.lastResponse?.message as string | undefined) ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="integration-${integrationId}-artifacts.csv"`,
    },
  });
}
