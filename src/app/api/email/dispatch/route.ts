import { NextResponse } from "next/server";
import { dispatchQueuedEmails } from "@/lib/email/dispatcher";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Daily sweep by Vercel Cron: sends whatever is still queued and retries failures. */
export async function GET(request: Request) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await dispatchQueuedEmails({ limit: 50, retryFailed: true, maxAttempts: 5 });
  return NextResponse.json({ ok: true, result });
}

export async function POST(request: Request) {
  const token =
    request.headers.get("x-dispatch-token") ??
    new URL(request.url).searchParams.get("token");
  const configuredToken = process.env.EMAIL_DISPATCH_TOKEN?.trim();

  if (configuredToken) {
    if (!token || token !== configuredToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "EMAIL_DISPATCH_TOKEN not configured" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = Number(body?.limit ?? 25);
  const retryFailed = Boolean(body?.retryFailed);
  const maxAttempts = Number(body?.maxAttempts ?? 5);

  const result = await dispatchQueuedEmails({
    limit: Number.isNaN(limit) ? 25 : limit,
    retryFailed,
    maxAttempts: Number.isNaN(maxAttempts) ? 5 : maxAttempts,
  });

  return NextResponse.json({ ok: true, result });
}
