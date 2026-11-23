import { redirect } from "next/navigation";

/** Old links land on the bill PDF. */
export default async function BillPrintPage({ params }: { params: Promise<{ billId: string }> }) {
  redirect(`/api/bills/${(await params).billId}/pdf`);
}
