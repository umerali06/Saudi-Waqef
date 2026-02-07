import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
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
  return id;
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
    .limit(limit)
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

  return notifications.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
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

export async function markNotificationRead(notificationId: string) {
  await db.collection("notifications").doc(notificationId).set(
    {
      status: "read",
      readAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function markAllNotificationsRead(params: {
  userId: string;
  companyId?: string | null;
}) {
  const snapshot = await db
    .collection("notifications")
    .where("userId", "==", params.userId)
    .get();

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    if (params.companyId && data.companyId !== params.companyId) {
      return;
    }
    batch.set(
      doc.ref,
      {
        status: "read",
        readAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  });
  await batch.commit();
}
