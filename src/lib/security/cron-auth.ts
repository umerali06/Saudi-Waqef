import { NextResponse } from "next/server";

/**
 * Gates the ZATCA cron routes. Vercel Cron auto-injects
 * `Authorization: Bearer $CRON_SECRET` on scheduled invocations; the
 * `x-cron-token` header / `?token=` query param fallback exists for local or
 * manual curl testing. Modeled on the existing HEALTHCHECK_TOKEN /
 * EMAIL_DISPATCH_TOKEN pattern in this codebase.
 */
export function requireCronSecret(request: Request): NextResponse | null {
  const configured = process.env.CRON_SECRET?.trim();
  if (!configured) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const headerToken = request.headers.get("x-cron-token");
  const queryToken = new URL(request.url).searchParams.get("token");
  const provided = bearer || headerToken || queryToken;

  if (!provided || provided !== configured) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
