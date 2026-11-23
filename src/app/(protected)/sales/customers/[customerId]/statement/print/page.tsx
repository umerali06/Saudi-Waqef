import { redirect } from "next/navigation";

/** Old links land on the same PDF the customer receives. */
export default async function CustomerStatementPrintPage({ params }: { params: Promise<{ customerId: string }> }) {
  redirect(`/api/customers/${(await params).customerId}/statement/pdf`);
}
