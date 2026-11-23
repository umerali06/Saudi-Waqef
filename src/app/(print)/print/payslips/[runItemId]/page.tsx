import { PayslipDocument } from "@/components/payslip-document";

export default async function PayslipPrintPage({
  params,
}: {
  params: Promise<{ runItemId: string }>;
}) {
  const { runItemId } = await params;
  return <PayslipDocument source={`/api/payroll/payslips/${encodeURIComponent(runItemId)}`} />;
}
