import { NextResponse } from "next/server";
import { findClosedPeriod } from "@/lib/data/accounting-periods";
import { getCompanyConfig } from "@/lib/data/company-config";

export const PERIOD_CLOSED = "PERIOD_CLOSED";

/** Whether postings on this date are stopped by the lock date or a closed period. */
export async function isPeriodClosed(
  companyId: string,
  date: string,
  options: { isAdjusting?: boolean } = {}
) {
  const config = await getCompanyConfig(companyId, { fresh: true });
  if (config.periodLockDate && date <= config.periodLockDate) {
    return true;
  }
  if (options.isAdjusting) {
    return false;
  }
  return Boolean(await findClosedPeriod(companyId, date));
}

export async function periodClosedResponse(
  companyId: string,
  date: string,
  options: { isAdjusting?: boolean } = {}
) {
  return (await isPeriodClosed(companyId, date, options))
    ? NextResponse.json({ error: PERIOD_CLOSED }, { status: 400 })
    : null;
}
