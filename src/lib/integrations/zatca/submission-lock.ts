import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";
import { logger } from "@/lib/ops/logger";

export class ZatcaLockHeldError extends Error {
  constructor(integrationId: string) {
    super(`ZATCA_LOCK_HELD: another ZATCA submission is already running for integration ${integrationId}.`);
    this.name = "ZatcaLockHeldError";
  }
}

export class ZatcaLockLostError extends Error {
  constructor(integrationId: string) {
    super(`ZATCA_LOCK_LOST: the submission lock for integration ${integrationId} was lost mid-run.`);
    this.name = "ZatcaLockLostError";
  }
}

const LOCKS_COLLECTION = "zatca_submission_locks";

/**
 * The ZATCA hash chain is strictly sequential within one submission run
 * (each document depends on the previous document's hash) — there is no
 * parallel work to reserve slots for. The real risk is two *overlapping runs*
 * for the same integration racing (a user click vs. a scheduled job). A
 * per-integration mutex is the minimal correct fix.
 */
export async function acquireZatcaSubmissionLock(integrationId: string, ttlMs = 10 * 60_000) {
  const ref = db.collection(LOCKS_COLLECTION).doc(integrationId);
  const runId = uuidv4();
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const expiresAtMs = data?.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
    if (snap.exists && expiresAtMs > now) {
      throw new ZatcaLockHeldError(integrationId);
    }
    tx.set(ref, {
      runId,
      acquiredAt: Timestamp.fromMillis(now),
      expiresAt: Timestamp.fromMillis(now + ttlMs),
    });
  });

  return runId;
}

export async function releaseZatcaSubmissionLock(integrationId: string, runId: string) {
  const ref = db.collection(LOCKS_COLLECTION).doc(integrationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || data?.runId !== runId) {
      logger.warn("zatca submission lock already released or stolen by TTL expiry", {
        integrationId,
        runId,
      });
      return;
    }
    tx.delete(ref);
  });
}
