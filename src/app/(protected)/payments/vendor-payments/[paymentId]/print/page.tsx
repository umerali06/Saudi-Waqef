import { redirect } from "next/navigation";

/** Old links land on the voucher PDF. */
export default async function VendorPaymentPrintPage({ params }: { params: Promise<{ paymentId: string }> }) {
  redirect(`/api/payments/vendor-payments/${(await params).paymentId}/pdf`);
}
