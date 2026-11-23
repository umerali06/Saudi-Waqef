"use client";

import { useTranslations } from "@/i18n/provider";

// A fixed pattern that reads as a QR code; it encodes nothing.
const QR = [
  "1111111010101111111", "1000001011001000001", "1011101001101011101", "1011101010101011101",
  "1011101011001011101", "1000001000101000001", "1111111010101111111", "0000000011100000000",
  "1101011100110101101", "0010100111001010010", "1011001010111100101", "0100110101001011010",
  "0000000010110100101", "1111111001011010011", "1000001011100101100", "1011101010011110101",
  "1011101001101001010", "1000001010110110101", "1111111010011010110",
];

/** The sign-in pages' picture: an invoice being written, signed and accepted. */
export function InvoiceVignette() {
  const { t } = useTranslations();
  const rows = [
    [t("auth.vignette.line1"), "4,500.00"],
    [t("auth.vignette.line2"), "1,200.00"],
    [t("auth.vignette.line3"), "800.00"],
  ];

  return (
    <div className="vignette" aria-hidden>
      <div className="vignette-sheet vignette-sheet-back" />
      <div className="vignette-sheet">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[#12202f]">{t("invoice.standardTaxInvoice")}</p>
            <p className="mt-0.5 text-xs text-[#5a6878]" dir="ltr">
              INV-2048
            </p>
          </div>
          <svg viewBox="0 0 19 19" className="vignette-qr h-[68px] w-[68px]" shapeRendering="crispEdges">
            {QR.flatMap((row, y) =>
              [...row].map((cell, x) =>
                cell === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0b2239" /> : null
              )
            )}
          </svg>
        </div>
        <ul className="mt-5 border-t border-[#dfe4ea] text-[13px] text-[#12202f]">
          {rows.map(([label, amount], index) => (
            <li
              key={label}
              className="vignette-row flex justify-between gap-4 border-b border-[#eef1f4] py-2.5"
              style={{ animationDelay: `${0.5 + index * 0.18}s` }}
            >
              <span>{label}</span>
              <span className="tabular-nums" dir="ltr">
                {amount}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1.5 text-[13px] text-[#5a6878]">
          <div className="vignette-row flex justify-between" style={{ animationDelay: "1.1s" }}>
            <dt>{t("auth.vignette.vat")}</dt>
            <dd className="tabular-nums" dir="ltr">
              975.00
            </dd>
          </div>
          <div
            className="vignette-row flex justify-between text-[15px] font-semibold text-[#12202f]"
            style={{ animationDelay: "1.28s" }}
          >
            <dt>{t("auth.vignette.total")}</dt>
            <dd className="tabular-nums" dir="ltr">
              7,475.00
            </dd>
          </div>
        </dl>
        <div className="vignette-stamp">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path className="vignette-check" pathLength={1} d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
          {t("auth.vignette.accepted")}
        </div>
      </div>
    </div>
  );
}
