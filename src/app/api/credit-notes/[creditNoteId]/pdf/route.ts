import { taxDocumentResponse } from "@/lib/pdf/respond";

export const runtime = "nodejs";
export const maxDuration = 30;

type RouteContext = {
  params: Promise<{ creditNoteId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return taxDocumentResponse(request, "credit", (await context.params).creditNoteId);
}
