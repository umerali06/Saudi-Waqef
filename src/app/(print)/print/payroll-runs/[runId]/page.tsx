import { PayslipDocument } from "@/components/payslip-document";

export default async function PayrollRunPrintPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return (
    <PayslipDocument source={`/api/payroll/runs/${encodeURIComponent(runId)}/payslips`} />
  );
}
