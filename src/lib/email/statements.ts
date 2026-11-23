import type { PartyType } from "@/lib/data/open-items";
import { sendDocumentEmail } from "@/lib/email/queue";
import { renderEmail } from "@/lib/email/template";
import { reportAmount, reportPeriod, translator } from "@/lib/pdf/report";
import { loadStatement } from "@/lib/pdf/statement";

/** Emails a party its statement as a PDF. The dates are kept so a retry sends the same period. */
export async function sendStatementEmail(params: {
  partyType: PartyType;
  partyId: string;
  to: string;
  locale?: unknown;
  from?: unknown;
  until?: unknown;
  replyTo?: string | null;
  resendOf?: string;
}) {
  const data = await loadStatement({
    partyType: params.partyType,
    partyId: params.partyId,
    from: params.from,
    to: params.until,
    locale: params.locale,
  });
  if (!data) {
    return { ok: false as const, id: null, error: "Not found" };
  }
  const { party, seller, period, locale, currency, statement } = data;
  const t = translator(locale);
  const title = t(
    params.partyType === "customer" ? "statement.customerTitle" : "statement.vendorTitle"
  );

  return sendDocumentEmail({
    companyId: party.companyId,
    to: params.to,
    subject: `${title} - ${seller.name}`,
    body: renderEmail({
      locale,
      heading: title,
      paragraphs: [t("statement.emailBody")],
      details: [
        [t("statement.party"), party.legalName || party.name],
        [t("statement.period"), reportPeriod(locale, period.from, period.to)],
        [
          t("statement.closingBalance"),
          `${reportAmount(statement.closingBalance)} ${currency}`,
        ],
      ],
      companyName: seller.name,
      footer: seller.vatNumber
        ? `${t("reports.pdf.vatNumber")}: ${seller.vatNumber}`
        : undefined,
    }),
    sourceType: params.partyType === "customer" ? "customer_statement" : "vendor_statement",
    sourceId: party.id,
    meta: {
      locale,
      from: period.from,
      to: period.to,
      recipientEmail: params.to,
      fromName: seller.name,
      replyTo: params.replyTo ?? null,
      ...(params.resendOf ? { resendOf: params.resendOf } : {}),
    },
  });
}
