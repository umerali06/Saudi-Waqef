import { NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { getSessionUser } from "@/lib/auth-helpers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const folder =
    typeof body.folder === "string" && body.folder.trim().length > 0
      ? body.folder.trim()
      : "uploads";

  const timestamp = Math.round(Date.now() / 1000);
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;

  if (!apiSecret || !cloudName || !apiKey) {
    return NextResponse.json(
      { error: "Cloudinary not configured" },
      { status: 500 }
    );
  }

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    apiSecret
  );

  return NextResponse.json({
    timestamp,
    signature,
    folder,
    cloudName,
    apiKey,
  });
}
