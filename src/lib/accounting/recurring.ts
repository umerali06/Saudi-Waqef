import { db } from "@/lib/firebase/admin";
import { isPeriodClosed } from "@/lib/accounting/period-guard";
import { getCompanyConfig } from "@/lib/data/company-config";
import { getCompanyDefaults } from "@/lib/data/company-defaults";
import { getCustomerById } from "@/lib/data/customers";
import { applyItemStockDeltas, listItems, type ItemRecord } from "@/lib/data/items";
import {
  getRecurringInvoice,
  listRecurringInvoices,
  updateRecurringInvoice,
  type RecurringInvoice,
} from "@/lib/data/recurring-invoices";
import { createSalesInvoice, type InvoiceLine } from "@/lib/data/sales-invoices";
import { listTaxCategories } from "@/lib/data/tax-categories";
import { findFiledVatPeriod } from "@/lib/data/vat-periods";
import { addDays } from "@/lib/utils/dates";
import { calculateLineAmounts, resolveTaxRate, sumLineAmounts } from "@/lib/utils/invoice";
import { nextRunAfter } from "@/lib/utils/recurring";
import { toBaseQuantity } from "@/lib/utils/units";

/** Stops a schedule left far in the past from flooding the company with drafts. */
const MAX_RUNS_PER_SCHEDULE = 24;

type RunFailure =
  | "CUSTOMER_UNAVAILABLE"
  | "ITEM_UNAVAILABLE"
  | "INSUFFICIENT_STOCK";

export type RecurringRunResult = {
  created: Array<{ recurringId: string; invoiceId: string; invoiceNumber: string }>;
  failed: Array<{ recurringId: string; customerName: string; reason: RunFailure }>;
};

/** Creates the draft invoices of every schedule that is due, missed runs included. */
export async function runRecurringInvoices(
  companyId: string,
  today: string
): Promise<RecurringRunResult> {
  const [schedules, items, taxCategories, defaults, config] = await Promise.all([
    listRecurringInvoices(companyId),
    listItems(companyId),
    listTaxCategories(companyId),
    getCompanyDefaults(companyId),
    getCompanyConfig(companyId),
  ]);
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const taxMap = new Map(taxCategories.map((tax) => [tax.id, tax]));
  const available = new Map(
    items.map((item) => [item.id, item.stockOnHand - item.stockReserved])
  );

  const buildLines = (schedule: RecurringInvoice) => {
    const lines: InvoiceLine[] = [];
    for (const line of schedule.template.lines) {
      const item = itemMap.get(line.itemId);
      if (!item || ![item.baseUnit, item.packUnit].includes(line.unit)) {
        return null;
      }
      const taxCategoryId =
        line.taxCategoryId ??
        item.taxCategoryId ??
        defaults.defaultSalesTaxCategoryId ??
        null;
      const taxRate = resolveTaxRate(
        taxCategoryId ? taxMap.get(taxCategoryId) : null,
        config.vatEnabled
      );
      lines.push({
        id: crypto.randomUUID(),
        itemId: item.id,
        description: line.description || item.name,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        discountRate: line.discountRate ?? 0,
        taxCategoryId,
        taxRate,
        ...calculateLineAmounts({
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountRate: line.discountRate ?? 0,
          taxRate,
          taxInclusive: Boolean(config.taxInclusive),
        }),
        baseQuantity: toBaseQuantity(line.quantity, line.unit, {
          baseUnit: item.baseUnit,
          packUnit: item.packUnit,
          packSize: item.packSize ?? undefined,
        }),
      });
    }
    return lines.length > 0 ? lines : null;
  };

  const result: RecurringRunResult = { created: [], failed: [] };

  for (const schedule of schedules) {
    if (schedule.status !== "active" || schedule.nextRunDate > today) {
      continue;
    }
    const fail = (reason: RunFailure) =>
      result.failed.push({
        recurringId: schedule.id,
        customerName: schedule.customerName,
        reason,
      });

    const customer = await getCustomerById(schedule.customerId);
    if (!customer || customer.companyId !== companyId || customer.status === "blacklisted") {
      fail("CUSTOMER_UNAVAILABLE");
      continue;
    }
    const lines = buildLines(schedule);
    if (!lines) {
      fail("ITEM_UNAVAILABLE");
      continue;
    }
    const reserved = sumTrackedQuantities(lines, itemMap);

    let runDate = schedule.nextRunDate;
    for (let run = 0; run < MAX_RUNS_PER_SCHEDULE && runDate <= today; run += 1) {
      const short = Array.from(reserved).some(
        ([itemId, quantity]) => (available.get(itemId) ?? 0) < quantity
      );
      if (short) {
        fail("INSUFFICIENT_STOCK");
        break;
      }

      const scheduledDate = runDate;
      const nextRunDate = nextRunAfter(scheduledDate, schedule.frequency, schedule.anchorDay);
      const isLocked =
        Boolean(await findFiledVatPeriod(companyId, scheduledDate)) ||
        (await isPeriodClosed(companyId, scheduledDate));
      const invoiceDate = isLocked ? today : scheduledDate;

      const invoice = await db.runTransaction(async (tx) => {
        const current = await getRecurringInvoice(schedule.id, tx);
        if (current?.status !== "active" || current.nextRunDate !== scheduledDate) {
          return null;
        }
        const totals = sumLineAmounts(lines);
        const created = await createSalesInvoice(
          {
            companyId,
            customerId: customer.id,
            customerName: customer.name,
            customerVatNumber: customer.vatNumber ?? null,
            billingAddress: customer.billingAddress ?? null,
            invoiceDate,
            dueDate: addDays(invoiceDate, schedule.template.dueDays),
            currency: customer.currency ?? "SAR",
            paymentTermId: schedule.template.paymentTermId ?? null,
            notes: schedule.template.notes ?? null,
            terms: schedule.template.terms ?? null,
            ...totals,
            balance: totals.total,
            status: "draft",
            lines: lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
          },
          tx
        );
        await applyItemStockDeltas(
          Array.from(reserved, ([itemId, quantity]) => ({
            itemId,
            stockReservedDelta: quantity,
          })),
          tx
        );
        await updateRecurringInvoice(
          schedule.id,
          { lastRunDate: today, nextRunDate, anchorDay: schedule.anchorDay },
          tx
        );
        return created;
      });
      if (!invoice) {
        break;
      }

      reserved.forEach((quantity, itemId) => {
        available.set(itemId, (available.get(itemId) ?? 0) - quantity);
      });
      result.created.push({
        recurringId: schedule.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      });
      runDate = nextRunDate;
    }
  }

  return result;
}

function sumTrackedQuantities(lines: InvoiceLine[], items: Map<string, ItemRecord>) {
  const quantities = new Map<string, number>();
  lines.forEach((line) => {
    if (line.itemId && items.get(line.itemId)?.trackInventory) {
      quantities.set(
        line.itemId,
        (quantities.get(line.itemId) ?? 0) + line.baseQuantity
      );
    }
  });
  return quantities;
}
