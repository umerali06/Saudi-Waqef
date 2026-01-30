import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/firebase/admin";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type SupportTicketPriority = "low" | "medium" | "high" | "urgent";
export type SupportTicketCategory =
  | "billing"
  | "technical"
  | "data"
  | "access"
  | "onboarding"
  | "other";

export type SupportTicket = {
  id: string;
  companyId: string;
  userId: string;
  userEmail?: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  message: string;
  status: SupportTicketStatus;
  locale?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export async function listSupportTickets(companyId: string) {
  const snapshot = await db
    .collection("support_tickets")
    .where("companyId", "==", companyId)
    .get();

  const tickets = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      companyId: data.companyId,
      userId: data.userId,
      userEmail: data.userEmail ?? null,
      subject: data.subject ?? "",
      category: (data.category ?? "other") as SupportTicketCategory,
      priority: (data.priority ?? "medium") as SupportTicketPriority,
      message: data.message ?? "",
      status: (data.status ?? "open") as SupportTicketStatus,
      locale: data.locale ?? null,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
    } as SupportTicket;
  });

  return tickets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getSupportTicketById(ticketId: string) {
  const doc = await db.collection("support_tickets").doc(ticketId).get();
  if (!doc.exists) {
    return null;
  }
  const data = doc.data()!;
  return {
    id: doc.id,
    companyId: data.companyId,
    userId: data.userId,
    userEmail: data.userEmail ?? null,
    subject: data.subject ?? "",
    category: (data.category ?? "other") as SupportTicketCategory,
    priority: (data.priority ?? "medium") as SupportTicketPriority,
    message: data.message ?? "",
    status: (data.status ?? "open") as SupportTicketStatus,
    locale: data.locale ?? null,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as SupportTicket;
}

export async function createSupportTicket(params: {
  companyId: string;
  userId: string;
  userEmail?: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  message: string;
  locale?: string | null;
}) {
  const id = uuidv4();
  await db.collection("support_tickets").doc(id).set({
    companyId: params.companyId,
    userId: params.userId,
    userEmail: params.userEmail ?? null,
    subject: params.subject,
    category: params.category,
    priority: params.priority,
    message: params.message,
    status: "open",
    locale: params.locale ?? null,
    createdAt: Timestamp.now(),
  });
  return id;
}

export async function updateSupportTicket(
  ticketId: string,
  updates: Partial<{
    status: SupportTicketStatus;
  }>
) {
  await db.collection("support_tickets").doc(ticketId).set(
    {
      ...updates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
}
