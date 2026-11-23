import { FieldValue, Timestamp } from "firebase-admin/firestore";
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

export type SupportTicketReply = {
  message: string;
  authorEmail: string | null;
  createdAt: Date;
};

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
  replies: SupportTicketReply[];
  createdAt: Date;
  updatedAt?: Date;
};

function mapTicket(doc: FirebaseFirestore.DocumentSnapshot) {
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
    replies: (data.replies ?? []).map(
      (reply: { message?: string; authorEmail?: string | null; createdAt?: Timestamp }) => ({
        message: reply.message ?? "",
        authorEmail: reply.authorEmail ?? null,
        createdAt: reply.createdAt?.toDate ? reply.createdAt.toDate() : new Date(),
      })
    ),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined,
  } as SupportTicket;
}

const newestFirst = (a: SupportTicket, b: SupportTicket) =>
  b.createdAt.getTime() - a.createdAt.getTime();

export async function listSupportTickets(companyId: string) {
  const snapshot = await db
    .collection("support_tickets")
    .where("companyId", "==", companyId)
    .get();
  return snapshot.docs.map(mapTicket).sort(newestFirst);
}

export async function listAllSupportTickets() {
  const snapshot = await db.collection("support_tickets").get();
  return snapshot.docs.map(mapTicket).sort(newestFirst);
}

export async function getSupportTicketById(ticketId: string) {
  const doc = await db.collection("support_tickets").doc(ticketId).get();
  return doc.exists ? mapTicket(doc) : null;
}

export async function addSupportTicketReply(
  ticketId: string,
  reply: { message: string; authorEmail: string | null }
) {
  await db
    .collection("support_tickets")
    .doc(ticketId)
    .set(
      {
        replies: FieldValue.arrayUnion({ ...reply, createdAt: Timestamp.now() }),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
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
