import { taxDocumentResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ invoiceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return taxDocumentResponse(request, "invoice", (await context.params).invoiceId);
}
