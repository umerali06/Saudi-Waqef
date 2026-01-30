import { NextResponse } from "next/server";
import { logger } from "@/lib/ops/logger";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const expectedToken = process.env.HEALTHCHECK_TOKEN;
  if (expectedToken) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || request.headers.get("x-health-token");
    if (!token || token !== expectedToken) {
      return NextResponse.json({ status: "unauthorized" }, { status: 401 });
    }
  }

  const payload = {
    status: "ok",
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION ?? "dev",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };

  logger.info("healthcheck", { env: payload.env, version: payload.version });

  return NextResponse.json(payload);
}
