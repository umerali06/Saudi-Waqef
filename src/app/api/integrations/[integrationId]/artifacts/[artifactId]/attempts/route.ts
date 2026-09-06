import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import {
  getZatcaArtifactById,
  listZatcaSubmissionAttempts,
} from "@/lib/data/zatca-artifacts";
import { redactSecrets } from "@/lib/security/redact";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string; artifactId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { integrationId, artifactId } = await context.params;
  const integration = await getIntegrationById(integrationId);
  if (!integration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAdminAccess(user.id, integration.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The artifact id comes from the client, so confirm it belongs to this
  // company before returning its submission history.
  const artifact = await getZatcaArtifactById(artifactId);
  if (!artifact || artifact.companyId !== integration.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const attempts = await listZatcaSubmissionAttempts(artifactId);
  return NextResponse.json({
    attempts: attempts.map((attempt) => ({
      id: attempt.id,
      attempt: attempt.attempt,
      httpStatus: attempt.httpStatus,
      technicalStatus: attempt.technicalStatus,
      operation: attempt.operation,
      environment: attempt.environment,
      response: redactSecrets(attempt.response),
      createdAt: attempt.createdAt.toISOString(),
    })),
  });
}
