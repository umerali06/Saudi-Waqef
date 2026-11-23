import { NextResponse } from "next/server";
import { db } from "@/lib/firebase/admin";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { createJournalEntry, getJournalEntry, updateJournalEntry } from "@/lib/data/journal-entries";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { PostingError, postingErrorResponse } from "@/lib/accounting/errors";
import { periodClosedResponse } from "@/lib/accounting/period-guard";
import { reverseLines } from "@/lib/utils/journal";
import { riyadhDate } from "@/lib/utils/riyadh";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entryId } = await context.params;
  const entry = await getJournalEntry(entryId);
  if (!entry || entry.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.sourceType !== "manual" || entry.status !== "posted") {
    return NextResponse.json({ error: "Entry cannot be reversed" }, { status: 400 });
  }

  if (entry.reversedAt) {
    return NextResponse.json({ error: "Entry already reversed" }, { status: 400 });
  }

  const reversalDate = riyadhDate();
  const closedPeriod = await periodClosedResponse(companyId, reversalDate);
  if (closedPeriod) {
    return closedPeriod;
  }

  let reversalId: string;
  try {
    reversalId = await db.runTransaction(async (tx) => {
      const current = await getJournalEntry(entryId, tx);
      if (!current || current.status !== "posted") {
        throw new PostingError("Entry cannot be reversed");
      }
      if (current.reversedAt) {
        throw new PostingError("Entry already reversed");
      }
      const id = await createJournalEntry(
        {
          companyId,
          sourceType: "manual_reversal",
          sourceId: entryId,
          date: reversalDate,
          memo: `Reversal of ${entryId}`,
          lines: reverseLines(current.lines),
          status: "posted",
          createdBy: user.id,
          approvedBy: user.id,
          approvedAt: new Date(),
          reversalOf: entryId,
        },
        tx
      );
      await updateJournalEntry(entryId, { reversedBy: user.id, reversedAt: new Date() }, tx);
      return id;
    });
  } catch (error) {
    return postingErrorResponse(error);
  }

  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "journal.reverse",
    entity: "journal_entry",
    entityId: reversalId,
    metadata: { reversalOf: entryId },
  });

  return NextResponse.json({ entryId: reversalId });
}
