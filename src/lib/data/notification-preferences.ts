import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationChannelPreferences = {
  email: boolean;
  inApp: boolean;
  sms: boolean;
};

export type NotificationPreferences = {
  id: string;
  userId: string;
  companyId: string;
  channels: NotificationChannelPreferences;
  types: Partial<Record<NotificationType, Partial<NotificationChannelPreferences>>>;
  createdAt: Date;
  updatedAt?: Date;
};

export const DEFAULT_CHANNELS: NotificationChannelPreferences = {
  email: true,
  inApp: true,
  sms: false,
};

export async function getNotificationPreferences(params: {
  userId: string;
  companyId: string;
}) {
  const snapshot = await db
    .collection("notification_preferences")
    .where("userId", "==", params.userId)
    .where("companyId", "==", params.companyId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    userId: data.userId,
    companyId: data.companyId,
    channels: {
      email: data.channels?.email ?? DEFAULT_CHANNELS.email,
      inApp: data.channels?.inApp ?? DEFAULT_CHANNELS.inApp,
      sms: data.channels?.sms ?? DEFAULT_CHANNELS.sms,
    },
    types: data.types ?? {},
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as NotificationPreferences;
}

export async function upsertNotificationPreferences(params: {
  userId: string;
  companyId: string;
  channels: NotificationChannelPreferences;
  types: Partial<Record<NotificationType, Partial<NotificationChannelPreferences>>>;
}) {
  const existing = await getNotificationPreferences({
    userId: params.userId,
    companyId: params.companyId,
  });
  if (existing) {
    await db.collection("notification_preferences").doc(existing.id).set(
      {
        channels: params.channels,
        types: params.types,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
    return existing.id;
  }

  const id = crypto.randomUUID();
  await db.collection("notification_preferences").doc(id).set({
    userId: params.userId,
    companyId: params.companyId,
    channels: params.channels,
    types: params.types,
    createdAt: Timestamp.now(),
  });
  return id;
}

export function resolveChannelPreferences(
  prefs: NotificationPreferences | null,
  type: NotificationType
): NotificationChannelPreferences {
  if (!prefs) {
    return DEFAULT_CHANNELS;
  }
  const typeOverride = prefs.types?.[type] ?? {};
  return {
    email: typeOverride.email ?? prefs.channels.email,
    inApp: typeOverride.inApp ?? prefs.channels.inApp,
    sms: typeOverride.sms ?? prefs.channels.sms,
  };
}
