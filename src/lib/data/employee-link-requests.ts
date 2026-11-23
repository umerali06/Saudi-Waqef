import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";

// A request stays open this long; afterwards the person may remind HR again.
const REQUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const requestRef = (companyId: string, userId: string) =>
  db.collection("employee_link_requests").doc(`${companyId}_${userId}`);

const isRecent = (doc: FirebaseFirestore.DocumentSnapshot) => {
  const createdAt = doc.data()?.createdAt?.toDate?.() as Date | undefined;
  return Boolean(createdAt && Date.now() - createdAt.getTime() < REQUEST_TTL_MS);
};

export async function hasRecentLinkRequest(companyId: string, userId: string) {
  return isRecent(await requestRef(companyId, userId).get());
}

/** True only for the caller that should notify HR. */
export async function claimLinkRequest(companyId: string, userId: string) {
  const ref = requestRef(companyId, userId);
  return db.runTransaction(async (transaction) => {
    if (isRecent(await transaction.get(ref))) {
      return false;
    }
    transaction.set(ref, { companyId, userId, createdAt: Timestamp.now() });
    return true;
  });
}
