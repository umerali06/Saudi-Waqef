import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type IntegrationLogLevel = "info" | "warn" | "error";

export type IntegrationLog = {
  id: string;
  companyId: string;
  integrationId: string;
  level: IntegrationLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

export async function listIntegrationLogs(
  integrationId: string,
  limitCount = 50
) {
  const snapshot = await db
    .collection("integration_logs")
    .where("integrationId", "==", integrationId)
    .get();

  const logs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      integrationId: data.integrationId,
      level: data.level ?? "info",
      message: data.message ?? "",
      metadata: data.metadata ?? {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as IntegrationLog;
  });

  return logs
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

export async function createIntegrationLog(params: {
  companyId: string;
  integrationId: string;
  level: IntegrationLogLevel;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const id = uuidv4();
  await db.collection("integration_logs").doc(id).set({
    companyId: params.companyId,
    integrationId: params.integrationId,
    level: params.level,
    message: params.message,
    metadata: params.metadata ?? {},
    createdAt: Timestamp.now(),
  });
  return id;
}
