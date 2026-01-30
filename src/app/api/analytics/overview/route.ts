import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireReportAccess } from "@/lib/access";
import { buildAnalyticsOverview } from "@/lib/reports/analytics";
import {
  analyticsCacheTtlSeconds,
  getAnalyticsCache,
  setAnalyticsCache,
} from "@/lib/reports/analytics-cache";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireReportAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const refresh = searchParams.get("refresh") === "true";
  const cacheKey = `${companyId}:${searchParams.get("startDate") ?? ""}:${
    searchParams.get("endDate") ?? ""
  }`;
  const cached = !refresh ? getAnalyticsCache(cacheKey) : null;

  if (cached) {
    return NextResponse.json({
      overview: cached.data,
      role: membership.role,
      cache: { cached: true, ageSeconds: cached.ageSeconds, ttlSeconds: analyticsCacheTtlSeconds },
    });
  }

  const overview = await buildAnalyticsOverview({
    companyId,
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
  });

  setAnalyticsCache(cacheKey, overview);

  return NextResponse.json({
    overview,
    role: membership.role,
    cache: { cached: false, ageSeconds: 0, ttlSeconds: analyticsCacheTtlSeconds },
  });
}
