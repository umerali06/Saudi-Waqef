export function calculateLineAmounts(params: {
  quantity: number;
  unitPrice: number;
  discountRate: number;
  taxRate: number;
  taxInclusive: boolean;
}) {
  const gross = params.quantity * params.unitPrice;
  const discountAmount = (gross * params.discountRate) / 100;
  const discounted = gross - discountAmount;
  if (params.taxInclusive) {
    const netAmount = discounted / (1 + params.taxRate);
    const taxAmount = discounted - netAmount;
    return {
      netAmount,
      taxAmount,
      totalAmount: discounted,
      discountAmount,
    };
  }
  const netAmount = discounted;
  const taxAmount = discounted * params.taxRate;
  return {
    netAmount,
    taxAmount,
    totalAmount: netAmount + taxAmount,
    discountAmount,
  };
}

export function clampNumber(value: number, min = 0) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, value);
}
