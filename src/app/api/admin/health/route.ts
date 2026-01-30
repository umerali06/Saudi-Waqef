import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listSystemJobs } from "@/lib/data/system-jobs";
import { getSystemHealthSummary } from "@/lib/data/system-metrics";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const [health, jobs] = await Promise.all([
    getSystemHealthSummary(),
    listSystemJobs(),
  ]);

  return NextResponse.json({
    ...health,
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      category: job.category,
      status: job.status,
      lastRunAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
      lastSuccessAt: job.lastSuccessAt ? job.lastSuccessAt.toISOString() : null,
      lastError: job.lastError ?? null,
    })),
  });
}
