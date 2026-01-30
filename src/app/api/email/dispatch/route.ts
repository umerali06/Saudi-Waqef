import { NextResponse } from "next/server";
import { dispatchQueuedEmails } from "@/lib/email/dispatcher";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token =
    request.headers.get("x-dispatch-token") ??
    new URL(request.url).searchParams.get("token");
  const configuredToken = process.env.EMAIL_DISPATCH_TOKEN?.trim();
  const appEnv = process.env.APP_ENV ?? "development";

  if (configuredToken) {
    if (!token || token !== configuredToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (appEnv !== "development") {
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
