import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireCompanyRole } from "@/lib/access";
import { listChartAccounts } from "@/lib/data/chart-accounts";
import {
  getJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from "@/lib/data/journal-entries";
import { manualJournalEntryUpdateSchema } from "@/lib/validators/journal-entries";
import { getCompanyConfig } from "@/lib/data/company-config";
import { findClosedPeriod } from "@/lib/data/accounting-periods";
import { recordAuditEvent } from "@/lib/data/audit-log";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ entryId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualJournalEntryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.message === "Unbalanced entry") {
      return NextResponse.json({ error: "Unbalanced entry" }, { status: 400 });
    }
    if (issue?.message === "Invalid line amount") {
      return NextResponse.json({ error: "Invalid line amount" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, parsed.data.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { entryId } = await context.params;
  const current = await getJournalEntry(entryId);
  if (!current || current.companyId !== parsed.data.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (current.sourceType !== "manual") {
    return NextResponse.json({ error: "Entry is not manual" }, { status: 400 });
  }

  const updates: {
    date?: string;
    memo?: string | null;
    lines?: { accountId: string; debit: number; credit: number }[];
    totalDebit?: number;
    totalCredit?: number;
    status?: "draft" | "posted" | "void";
    approvedBy?: string | null;
    approvedAt?: Date | null;
    isAdjusting?: boolean;
  } = {};

  const isDraft = current.status === "draft";
  const nextStatus = parsed.data.status ?? current.status;

  if (!isDraft) {
    if (parsed.data.lines || parsed.data.date || parsed.data.isAdjusting) {
      return NextResponse.json({ error: "Entry is not editable" }, { status: 400 });
    }
    if (parsed.data.status === "void") {
      return NextResponse.json({ error: "Posted entries cannot be voided" }, { status: 400 });
    }
    if (parsed.data.memo !== undefined) {
      updates.memo = parsed.data.memo ?? null;
    }
  }

  if (isDraft) {
    if (parsed.data.date) {
      updates.date = parsed.data.date;
    }
    if (parsed.data.memo !== undefined) {
      updates.memo = parsed.data.memo ?? null;
    }
    if (parsed.data.isAdjusting !== undefined) {
      updates.isAdjusting = parsed.data.isAdjusting;
    }

    if (parsed.data.lines) {
      const accounts = await listChartAccounts(parsed.data.companyId);
      const accountMap = new Map(accounts.map((account) => [account.id, account]));
      for (const line of parsed.data.lines) {
        const account = accountMap.get(line.accountId);
        if (!account || !account.isPosting || account.status !== "active") {
          return NextResponse.json({ error: "Invalid account" }, { status: 400 });
        }
      }
      const totalDebit = parsed.data.lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = parsed.data.lines.reduce((sum, line) => sum + line.credit, 0);
      updates.lines = parsed.data.lines;
      updates.totalDebit = totalDebit;
      updates.totalCredit = totalCredit;
    }

    if (nextStatus === "posted") {
      const entryDate = updates.date ?? current.date;
      const isAdjusting = updates.isAdjusting ?? current.isAdjusting ?? false;
      const config = await getCompanyConfig(parsed.data.companyId);
      if (config.periodLockDate && entryDate <= config.periodLockDate) {
        return NextResponse.json(
          { error: "Posting period is locked" },
          { status: 403 }
        );
      }
      const closedPeriod = await findClosedPeriod(parsed.data.companyId, entryDate);
      if (closedPeriod && !isAdjusting) {
        return NextResponse.json(
          { error: "Accounting period is closed" },
          { status: 403 }
        );
      }
      updates.status = "posted";
      updates.approvedBy = user.id;
      updates.approvedAt = new Date();
    } else if (nextStatus === "void") {
      updates.status = "void";
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await updateJournalEntry(entryId, updates);

  await recordAuditEvent({
    companyId: parsed.data.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action:
      updates.status === "posted"
        ? "journal.post"
        : updates.status === "void"
        ? "journal.void"
        : "journal.update",
    entity: "journal_entry",
    entityId: entryId,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
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
  const current = await getJournalEntry(entryId);
  if (!current || current.companyId !== companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (current.status !== "draft") {
    return NextResponse.json({ error: "Entry is not editable" }, { status: 400 });
  }

  await deleteJournalEntry(entryId);
  await recordAuditEvent({
    companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "journal.delete",
    entity: "journal_entry",
    entityId: entryId,
  });
  return NextResponse.json({ ok: true });
}
