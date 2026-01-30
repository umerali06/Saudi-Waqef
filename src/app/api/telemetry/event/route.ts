import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { createTelemetryEvent } from "@/lib/data/telemetry";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(3).max(80),
  companyId: z.string().trim().optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

const ALLOWED_EVENTS = new Set([
  "onboarding.started",
  "onboarding.completed",
  "invoice.created",
  "payroll.run.created",
  "support.ticket.created",
  "api.key.created",
]);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!ALLOWED_EVENTS.has(parsed.data.name)) {
    return NextResponse.json({ error: "Unsupported event" }, { status: 400 });
  }

  await createTelemetryEvent({
    name: parsed.data.name,
    companyId: parsed.data.companyId ?? null,
    userId: user.id,
    metadata: parsed.data.metadata ?? {},
  });

  return NextResponse.json({ success: true });
}
