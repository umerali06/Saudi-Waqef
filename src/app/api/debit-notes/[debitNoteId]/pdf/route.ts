import { taxDocumentResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ debitNoteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return taxDocumentResponse(request, "debit", (await context.params).debitNoteId);
}
