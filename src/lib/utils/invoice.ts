/** Rounds money to 2 decimals, half away from zero. */
export function roundMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(Math.abs(value) * 100 + 1e-6) / 100;
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

export function calculateLineAmounts(params: {
  quantity: number;
  unitPrice: number;
  discountRate: number;
  taxRate: number;
  taxInclusive: boolean;
}) {
  const gross = roundMoney(params.quantity * params.unitPrice);
  const discountAmount = roundMoney((gross * params.discountRate) / 100);
  const discounted = roundMoney(gross - discountAmount);
  if (params.taxInclusive) {
    const netAmount = roundMoney(discounted / (1 + params.taxRate));
    const taxAmount = roundMoney(discounted - netAmount);
    return {
      netAmount,
      taxAmount,
      totalAmount: discounted,
      discountAmount,
    };
  }
  const netAmount = discounted;
  const taxAmount = roundMoney(discounted * params.taxRate);
  return {
    netAmount,
    taxAmount,
    totalAmount: roundMoney(netAmount + taxAmount),
    discountAmount,
  };
}

type LineAmounts = {
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  discountAmount: number;
};

/** Document totals from its lines. */
export function sumLineAmounts(lines: LineAmounts[]) {
  const sum = (pick: (line: LineAmounts) => number) =>
    roundMoney(lines.reduce((total, line) => total + pick(line), 0));
  return {
    subtotal: sum((line) => line.netAmount),
    discountTotal: sum((line) => line.discountAmount),
    taxTotal: sum((line) => line.taxAmount),
    total: sum((line) => line.totalAmount),
  };
}

/** Rounds lines saved before amounts were stored at 2 decimals. */
export function roundLineAmounts<T extends LineAmounts>(lines: T[]): T[] {
  return lines.map((line) => {
    const netAmount = roundMoney(line.netAmount);
    const taxAmount = roundMoney(line.taxAmount);
    return {
      ...line,
      netAmount,
      taxAmount,
      discountAmount: roundMoney(line.discountAmount),
      totalAmount: roundMoney(netAmount + taxAmount),
    };
  });
}

/** VAT rate as a fraction. Companies with VAT turned off never charge it. */
export function resolveTaxRate(
  category: { rate?: number | null } | null | undefined,
  vatEnabled: boolean
) {
  if (!vatEnabled || !category) {
    return 0;
  }
  return (category.rate ?? 0) / 100;
}

/** A note line keeps the rate charged on the original line unless its category changed. */
export function resolveNoteTaxRate(params: {
  original?: { taxRate: number; taxCategoryId?: string | null } | null;
  taxCategoryId: string | null;
  category: { rate?: number | null } | null | undefined;
  vatEnabled: boolean;
}) {
  if (
    params.original &&
    (params.original.taxCategoryId ?? null) === params.taxCategoryId
  ) {
    return params.original.taxRate;
  }
  return resolveTaxRate(params.category, params.vatEnabled);
}

export function clampNumber(value: number, min = 0) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, value);
}
