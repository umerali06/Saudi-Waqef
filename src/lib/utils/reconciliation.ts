import { roundMoney } from "@/lib/utils/invoice";

/** Banks post a few days after the payment is recorded. */
const DATE_WINDOW_DAYS = 3;

type CashMovement = { date: string; amount: number; direction: "in" | "out" };

const daysApart = (first: string, second: string) =>
  Math.abs(Date.parse(`${first}T00:00:00Z`) - Date.parse(`${second}T00:00:00Z`)) / 86_400_000;

export function sameMovement(line: { amount: number }, movement: CashMovement) {
  const direction = line.amount >= 0 ? "in" : "out";
  return (
    movement.direction === direction &&
    roundMoney(movement.amount) === roundMoney(Math.abs(line.amount))
  );
}

/** The movement of the same amount nearest in date to a bank statement line. */
export function findStatementMatch<T extends CashMovement>(
  line: { date: string; amount: number },
  movements: T[]
): T | null {
  const candidates = movements
    .filter((movement) => sameMovement(line, movement))
    .map((movement) => ({ movement, days: daysApart(line.date, movement.date) }))
    .filter(({ days }) => days <= DATE_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days);
  return candidates[0]?.movement ?? null;
}
