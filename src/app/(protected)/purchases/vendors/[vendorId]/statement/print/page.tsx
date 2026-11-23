import { redirect } from "next/navigation";

/** Old links land on the same PDF the vendor receives. */
export default async function VendorStatementPrintPage({ params }: { params: Promise<{ vendorId: string }> }) {
  redirect(`/api/vendors/${(await params).vendorId}/statement/pdf`);
}
