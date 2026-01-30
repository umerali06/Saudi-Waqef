import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/admin/access";
import { listSystemJobs } from "@/lib/data/system-jobs";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireSystemAdmin();
  if (access.response) {
    return access.response;
  }

  const jobs = await listSystemJobs();
  return NextResponse.json({
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
