import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAdminAccess } from "@/lib/access";
import {
  createApiKey,
  listApiKeys,
  type ApiKeyScope,
} from "@/lib/data/api-keys";
import { createTelemetryEvent } from "@/lib/data/telemetry";

export const runtime = "nodejs";

const schema = z.object({
  companyId: z.string().trim(),
  name: z.string().trim().min(2),
  scopes: z.array(z.string()).default([]),
});

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const membership = await requireAdminAccess(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await listApiKeys(companyId);
  return NextResponse.json({
    keys: keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      status: key.status,
      createdByEmail: key.createdByEmail ?? null,
      createdAt: key.createdAt.toISOString(),
      revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
      lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    })),
  });
}

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

  const membership = await requireAdminAccess(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scopes = parsed.data.scopes.filter(Boolean) as ApiKeyScope[];
  const result = await createApiKey({
    companyId: parsed.data.companyId,
    name: parsed.data.name,
    scopes,
    createdBy: user.id,
    createdByEmail: user.email ?? null,
  });

  await createTelemetryEvent({
    name: "api.key.created",
    companyId: parsed.data.companyId,
    userId: user.id,
    metadata: { scopes },
  });

  return NextResponse.json({
    key: {
      id: result.id,
      token: result.token,
      prefix: result.prefix,
    },
  });
}


