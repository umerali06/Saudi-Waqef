import { NextRequest, NextResponse } from "next/server";
import { getRegistrationRequests } from "@/lib/data/registration-requests";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    
    const requests = await getRegistrationRequests(status || undefined);
    
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Failed to fetch registration requests:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
