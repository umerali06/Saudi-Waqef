import crypto from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

/** Counts one use of `key`; false once `max` uses happened inside the window. */
export async function takeRateLimit(key: string, max: number, windowMinutes: number) {
  const id = crypto.createHash("sha256").update(key).digest("hex");
  const ref = db.collection("rate_limits").doc(id);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const now = Date.now();
    const endsAt = data?.endsAt?.toMillis?.() ?? 0;
    const open = endsAt > now;
    const count = open ? Number(data?.count ?? 0) : 0;
    if (count >= max) return false;
    tx.set(ref, {
      count: count + 1,
      endsAt: Timestamp.fromMillis(open ? endsAt : now + windowMinutes * 60_000),
    });
    return true;
  });
}
