import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { Invite, Role } from "@/lib/types";

export async function createInvite(params: {
  id: string;
  token: string;
  email: string;
  companyId: string;
  role: Role;
  expiresAt: Date;
}) {
  await db.collection("invites").doc(params.id).set({
    token: params.token,
    email: params.email.trim().toLowerCase(),
    companyId: params.companyId,
    role: params.role,
    status: "pending",
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(params.expiresAt),
  });
}

export async function getInviteByToken(token: string) {
  const snapshot = await db
    .collection("invites")
    .where("token", "==", token)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    token: data.token,
    email: data.email,
    companyId: data.companyId,
    role: data.role,
    status: data.status,
    createdAt: data.createdAt.toDate(),
    expiresAt: data.expiresAt.toDate(),
    acceptedAt: data.acceptedAt?.toDate?.(),
  } as Invite;
}

export async function acceptInvite(inviteId: string) {
  await db.collection("invites").doc(inviteId).update({
    status: "accepted",
    acceptedAt: Timestamp.now(),
  });
}

export function isInviteExpired(invite: Invite) {
  return invite.expiresAt.getTime() < Date.now();
}
