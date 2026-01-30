import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-helpers";
import { requireAccountingAccess, requireCompanyRole } from "@/lib/access";
import { inventoryAdjustmentSchema } from "@/lib/validators/items";
import { getItemById } from "@/lib/data/items";
import { createInventoryAdjustment, listInventoryAdjustments } from "@/lib/data/inventory-adjustments";
import { recordAuditEvent } from "@/lib/data/audit-log";
import { getUnitOptions, toBaseQuantity } from "@/lib/utils/units";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await requireAccountingAccess(user.id, item.companyId);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adjustments = await listInventoryAdjustments(itemId);
  return NextResponse.json({ adjustments });
}

export async function POST(request: Request, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await context.params;
  const item = await getItemById(itemId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!item.trackInventory) {
    return NextResponse.json({ error: "Inventory not tracked" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inventoryAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.companyId !== item.companyId) {
    return NextResponse.json({ error: "Invalid company" }, { status: 400 });
  }

  const membership = await requireCompanyRole(user.id, item.companyId, [
    "owner",
    "admin",
    "accountant",
  ]);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const unitOptions = getUnitOptions({
    baseUnit: item.baseUnit,
    packUnit: item.packUnit,
    packSize: item.packSize,
  });
  const unitValid = unitOptions.some((option) => option.unit === parsed.data.unit);
  if (!unitValid) {
    return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
  }

  const baseQuantity = toBaseQuantity(
    parsed.data.quantity,
    parsed.data.unit,
    {
      baseUnit: item.baseUnit,
      packUnit: item.packUnit,
      packSize: item.packSize,
    }
  );

  const adjustmentId = await createInventoryAdjustment({
    companyId: parsed.data.companyId,
    itemId,
    quantity: parsed.data.quantity,
    unit: parsed.data.unit,
    baseQuantity,
    reason: parsed.data.reason,
    note: parsed.data.note ?? null,
  });

  await recordAuditEvent({
    companyId: item.companyId,
    userId: user.id,
    userEmail: user.email ?? undefined,
    action: "item.adjustment.create",
    entity: "item",
    entityId: itemId,
    metadata: {
      adjustmentId,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ adjustmentId });
}

