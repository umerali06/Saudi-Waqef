import { redirect } from "next/navigation";

/** Old links land on the same PDF the customer receives. */
export default async function InvoicePrintPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  redirect(`/api/invoices/${(await params).invoiceId}/pdf`);
}
