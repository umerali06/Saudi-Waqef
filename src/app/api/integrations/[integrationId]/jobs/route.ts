import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import { getIntegrationById } from "@/lib/data/integrations";
import { listIntegrationJobs } from "@/lib/data/integration-jobs";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ integrationId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
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

  const jobs = await listIntegrationJobs(integrationId);
  return NextResponse.json({
    jobs: jobs.map((job) => ({
      ...job,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt ? job.updatedAt.toISOString() : null,
    })),
  });
}

