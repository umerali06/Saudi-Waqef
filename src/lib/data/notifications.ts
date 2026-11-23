import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { isUrgentNotification, notificationUrl } from "@/lib/notifications/links";
import { sendPush } from "@/lib/notifications/push";
import type { NotificationType } from "@/lib/notifications/types";

export type NotificationStatus = "unread" | "read";

export type InAppNotification = {
  id: string;
  companyId: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  status: NotificationStatus;
  data?: Record<string, unknown>;
  createdAt: Date;
  readAt?: Date | null;
};

export async function createNotification(params: {
  companyId?: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("notifications").doc(id).set({
    companyId: params.companyId ?? null,
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data ?? {},
    status: "unread",
    createdAt: Timestamp.now(),
  });
  await bumpNotificationVersion(params.userId);
  await sendPush(params.userId, {
    title: params.title,
    body: params.body,
    url: notificationUrl(params.type, params.data),
    tag: id,
    urgent: isUrgentNotification(params.type),
  });
  return id;
}

/** Changes whenever the user's list does; open pages watch it instead of re-reading the list. */
export async function bumpNotificationVersion(userId: string) {
  await db
    .collection("notification_state")
    .doc(userId)
    .set({ version: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
}

export async function getNotificationVersion(userId: string) {
  const doc = await db.collection("notification_state").doc(userId).get();
  return Number(doc.data()?.version ?? 0);
}

export async function listNotifications(params: {
  userId: string;
  companyId?: string | null;
  status?: NotificationStatus | "all" | null;
  limit?: number;
}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 200;
  const snapshot = await db
    .collection("notifications")
    .where("userId", "==", params.userId)
    .get();

  let notifications = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      status: data.status ?? "unread",
      data: data.data ?? {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      readAt: data.readAt?.toDate ? data.readAt.toDate() : null,
    } as InAppNotification;
  });

  if (params.companyId) {
    notifications = notifications.filter(
      (entry) => entry.companyId === params.companyId || !entry.companyId
    );
  }
  if (params.status && params.status !== "all") {
    notifications = notifications.filter((entry) => entry.status === params.status);
  }

  return notifications
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function getNotificationById(notificationId: string) {
  const doc = await db.collection("notifications").doc(notificationId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    userId: data.userId,
    type: data.type,
    title: data.title,
    body: data.body,
    status: data.status ?? "unread",
    data: data.data ?? {},
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    readAt: data.readAt?.toDate ? data.readAt.toDate() : null,
  } as InAppNotification;
}

export async function markNotificationRead(notification: Pick<InAppNotification, "id" | "userId">) {
  await db.collection("notifications").doc(notification.id).set(
    {
      status: "read",
      readAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  await bumpNotificationVersion(notification.userId);
}

export async function markAllNotificationsRead(params: {
  userId: string;
  companyId?: string | null;
}) {
  const snapshot = await db
    .collection("notifications")
    .where("userId", "==", params.userId)
    .where("status", "==", "unread")
    .get();

  const unread = snapshot.docs.filter((doc) => {
    const companyId = doc.data().companyId ?? null;
    return !params.companyId || companyId === params.companyId || companyId === null;
  });
  // Firestore allows 500 writes per batch.
  for (let start = 0; start < unread.length; start += 400) {
    const batch = db.batch();
    unread.slice(start, start + 400).forEach((doc) => {
      batch.update(doc.ref, {
        status: "read",
        readAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
    await batch.commit();
  }
  if (unread.length > 0) await bumpNotificationVersion(params.userId);
}
