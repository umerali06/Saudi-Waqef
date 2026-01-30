import { Timestamp } from "firebase-admin/firestore";
import { db } from "@/lib/firebase/admin";
import type { Role } from "@/lib/types";

export type MembershipRecord = {
  id: string;
  userId: string;
  companyId: string;
  role: Role;
  createdAt: Date;
};

export async function createMembership(params: {
  id: string;
  userId: string;
  companyId: string;
  role: Role;
}) {
  await db.collection("memberships").doc(params.id).set({
    userId: params.userId,
    companyId: params.companyId,
    role: params.role,
    createdAt: Timestamp.now(),
  });
}

export async function getMembership(params: {
  userId: string;
  companyId: string;
}) {
  const snapshot = await db
    .collection("memberships")
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
    role: data.role,
    createdAt: data.createdAt.toDate(),
  } as MembershipRecord;
}

export async function listMembershipsByUser(userId: string) {
  const snapshot = await db
    .collection("memberships")
    .where("userId", "==", userId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      companyId: data.companyId,
      role: data.role,
      createdAt: data.createdAt.toDate(),
    } as MembershipRecord;
  });
}

export async function listMembershipsByCompany(companyId: string) {
  const snapshot = await db
    .collection("memberships")
    .where("companyId", "==", companyId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      companyId: data.companyId,
      role: data.role,
      createdAt: data.createdAt.toDate(),
    } as MembershipRecord;
  });
}

export async function updateMembershipRole(membershipId: string, role: Role) {
  await db.collection("memberships").doc(membershipId).set(
    {
      role,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}

export async function deleteMembership(membershipId: string) {
  await db.collection("memberships").doc(membershipId).delete();
}
