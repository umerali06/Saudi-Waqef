import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type AuditEvent = {
  id: string;
  companyId: string;
  userId: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

export async function recordAuditEvent(params: {
  companyId: string;
  userId: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("audit_logs").doc(id).set({
    companyId: params.companyId,
    userId: params.userId,
    userEmail: params.userEmail ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    metadata: params.metadata ?? {},
    createdAt: Timestamp.now(),
  });
  return id;
}
