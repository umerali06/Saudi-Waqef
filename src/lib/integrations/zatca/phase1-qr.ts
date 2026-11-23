/**
 * Phase-1 QR: five TLV fields, base64. Required on tax invoices of sellers who
 * have not been brought into integrated (Phase-2) e-invoicing yet.
 */
export const buildPhase1Qr = (params: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  vat: number;
}) => {
  const fields = [
    params.sellerName,
    params.vatNumber,
    params.timestamp,
    params.total.toFixed(2),
    params.vat.toFixed(2),
  ];
  return Buffer.concat(
    fields.map((value, index) => {
      // Lengths are in bytes (Arabic takes two per letter) and limited to one byte.
      let text = value;
      while (Buffer.byteLength(text, "utf8") > 255) text = text.slice(0, -1);
      const bytes = Buffer.from(text, "utf8");
      return Buffer.concat([Buffer.from([index + 1, bytes.length]), bytes]);
    })
  ).toString("base64");
};
