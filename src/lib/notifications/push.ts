import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import webpush from "web-push";
import { db } from "@/lib/firebase/admin";
import { logger } from "@/lib/ops/logger";
import { decryptString, encryptString } from "@/lib/security/crypto";

/**
 * Web Push: reaches a person's phone or computer within seconds, with the
 * system's own sound, even when the site is closed.
 */
export type PushMessage = {
  title: string;
  body: string;
  url: string;
  /** A later message with the same tag replaces the earlier one. */
  tag: string;
  urgent?: boolean;
};

type VapidKeys = { publicKey: string; privateKey: string };

let cachedKeys: VapidKeys | null = null;

/** One key pair per database, created on first use, so no deployment setting is needed. */
export async function getVapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  const ref = db.collection("platform_settings").doc("web_push");
  const keys = await db.runTransaction<VapidKeys>(async (tx) => {
    const stored = (await tx.get(ref)).data();
    if (stored?.publicKey && stored.privateKeyEnc) {
      return { publicKey: stored.publicKey, privateKey: decryptString(stored.privateKeyEnc) };
    }
    const generated = webpush.generateVAPIDKeys();
    tx.set(ref, {
      publicKey: generated.publicKey,
      privateKeyEnc: encryptString(generated.privateKey),
      createdAt: Timestamp.now(),
    });
    return generated;
  });
  cachedKeys = keys;
  return keys;
}

const subscriptionId = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex");

export async function savePushSubscription(params: {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
}) {
  // Keyed by device: whoever is signed in on it now owns its notifications.
  await db.collection("push_subscriptions").doc(subscriptionId(params.endpoint)).set({
    userId: params.userId,
    endpoint: params.endpoint,
    keys: params.keys,
    userAgent: params.userAgent ?? null,
    createdAt: Timestamp.now(),
  });
}

export async function deletePushSubscription(userId: string, endpoint: string) {
  const ref = db.collection("push_subscriptions").doc(subscriptionId(endpoint));
  const doc = await ref.get();
  if (doc.exists && doc.data()?.userId === userId) await ref.delete();
}

/** Never throws: a notification that is already stored must not fail because a push did. */
export async function sendPush(userId: string, message: PushMessage) {
  try {
    const snapshot = await db.collection("push_subscriptions").where("userId", "==", userId).get();
    if (snapshot.empty) return;
    const keys = await getVapidKeys();
    const contact = process.env.EMAIL_FROM_ADDRESS?.trim();
    await Promise.allSettled(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        try {
          await webpush.sendNotification(
            { endpoint: data.endpoint, keys: data.keys },
            JSON.stringify(message),
            {
              vapidDetails: {
                subject: contact ? `mailto:${contact}` : "https://saudi-waqef.vercel.app",
                ...keys,
              },
              TTL: 24 * 60 * 60,
              urgency: message.urgent ? "high" : "normal",
              timeout: 8000,
            }
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // The browser dropped this subscription; it will never work again.
          if (status === 404 || status === 410) await doc.ref.delete();
          else logger.warn("Push could not be delivered", { userId, status: status ?? null });
        }
      })
    );
  } catch (error) {
    logger.warn("Push sending failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
