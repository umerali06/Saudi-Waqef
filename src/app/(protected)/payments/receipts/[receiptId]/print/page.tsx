import { redirect } from "next/navigation";

/** Old links land on the receipt PDF. */
export default async function ReceiptPrintPage({ params }: { params: Promise<{ receiptId: string }> }) {
  redirect(`/api/payments/receipts/${(await params).receiptId}/pdf`);
}
