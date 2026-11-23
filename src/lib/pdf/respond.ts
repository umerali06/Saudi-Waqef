import { NextResponse } from "next/server";
import { requireAccountingAccess } from "@/lib/access";
import { getSessionUser } from "@/lib/auth-helpers";
import { buildTaxDocumentPdf, getTaxDocumentCompanyId, type TaxDocumentKind } from "@/lib/pdf/tax-document-data";

/** Shown in the browser by default; `?download=1` saves it. */
export const pdfResponse = (pdf: Buffer, fileName: string, request: Request) => {
  const disposition = new URL(request.url).searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${fileName.replace(/[^\w.-]+/g, "-")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
};

export async function taxDocumentResponse(request: Request, kind: TaxDocumentKind, id: string) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const companyId = await getTaxDocumentCompanyId(kind, id);
  if (!companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await requireAccountingAccess(user.id, companyId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const document = await buildTaxDocumentPdf(kind, id);
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return pdfResponse(document.pdf, document.fileName, request);
}
