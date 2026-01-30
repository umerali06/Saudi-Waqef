import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth-helpers";
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
  DEFAULT_CHANNELS,
} from "@/lib/data/notification-preferences";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";
import { requireCompanyMembership } from "@/lib/access";

export const runtime = "nodejs";

const channelSchema = z.object({
  email: z.boolean(),
  inApp: z.boolean(),
  sms: z.boolean(),
});

const typeSchema = z.record(channelSchema.partial());

const updateSchema = z.object({
  companyId: z.string().min(1),
  channels: channelSchema,
  types: typeSchema.optional(),
});

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

  const membership = await requireCompanyMembership(user.id, companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prefs = await getNotificationPreferences({ userId: user.id, companyId });
  return NextResponse.json({
    preferences: prefs ?? {
      userId: user.id,
      companyId,
      channels: DEFAULT_CHANNELS,
      types: {},
    },
    notificationTypes: NOTIFICATION_TYPES,
  });
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyMembership(user.id, parsed.data.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const types: Record<string, Record<string, boolean>> = {};
  for (const key of Object.keys(parsed.data.types ?? {})) {
    if (NOTIFICATION_TYPES.includes(key as (typeof NOTIFICATION_TYPES)[number])) {
      types[key] = parsed.data.types?.[key] ?? {};
    }
  }

  await upsertNotificationPreferences({
    userId: user.id,
    companyId: parsed.data.companyId,
    channels: parsed.data.channels,
    types,
  });

  return NextResponse.json({ ok: true });
}
