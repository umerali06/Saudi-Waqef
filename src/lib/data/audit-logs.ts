import { db } from "@/lib/firebase/admin";
import type { AuditEvent } from "@/lib/data/audit-log";

export async function listAuditEvents(params: {
  companyId: string;
  userId?: string | null;
  action?: string | null;
  entity?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  query?: string | null;
  limit?: number;
}) {
  const limit = params.limit && params.limit > 0 ? params.limit : 200;
  const snapshot = await db
    .collection("audit_logs")
    .where("companyId", "==", params.companyId)
    .limit(limit)
    .get();

  const events = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      userId: data.userId,
      userEmail: data.userEmail ?? undefined,
      action: data.action ?? "",
      entity: data.entity ?? "",
      entityId: data.entityId ?? null,
      metadata: data.metadata ?? {},
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    } as AuditEvent;
  });

  let filtered = events;
  if (params.userId) {
    filtered = filtered.filter((event) => event.userId === params.userId);
  }
  if (params.action) {
    filtered = filtered.filter((event) => event.action === params.action);
  }
  if (params.entity) {
    filtered = filtered.filter((event) => event.entity === params.entity);
  }

  if (params.startDate || params.endDate) {
    const start = params.startDate ? new Date(`${params.startDate}T00:00:00Z`) : null;
    const end = params.endDate ? new Date(`${params.endDate}T23:59:59Z`) : null;
    filtered = filtered.filter((event) => {
      const time = event.createdAt.getTime();
      if (start && time < start.getTime()) {
        return false;
      }
      if (end && time > end.getTime()) {
        return false;
      }
      return true;
    });
  }

  if (params.query) {
    const needle = params.query.toLowerCase();
    filtered = filtered.filter((event) => {
      const metadata = JSON.stringify(event.metadata ?? {}).toLowerCase();
      return (
        event.action.toLowerCase().includes(needle) ||
        event.entity.toLowerCase().includes(needle) ||
        (event.userEmail ?? "").toLowerCase().includes(needle) ||
        (event.entityId ?? "").toLowerCase().includes(needle) ||
        metadata.includes(needle)
      );
    });
  }

  return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
