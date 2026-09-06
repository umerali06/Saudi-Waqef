import { getZatcaArtifactByInvoiceId } from "@/lib/data/zatca-artifacts";

/**
 * A document ZATCA has accepted is part of the taxpayer's filed record and of
 * the invoice hash chain. It must not be voided or deleted in place —
 * corrections are issued as credit/debit notes instead.
 */
export async function isZatcaFinalized(companyId: string, documentId: string) {
  const artifact = await getZatcaArtifactByInvoiceId(companyId, documentId);
  return artifact?.status === "accepted" || artifact?.status === "warning";
}
