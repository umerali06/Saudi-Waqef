import { NextResponse } from "next/server";
import { listActiveCompanies } from "@/lib/data/companies";

export const runtime = "nodejs";

export async function GET() {
  try {
    const companies = await listActiveCompanies();
    return NextResponse.json({
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name,
      })),
    });
  } catch (error) {
    console.error("Failed to list active companies:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
