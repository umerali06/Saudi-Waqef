import { logApiKeyUsage, updateApiKeyLastUsed, verifyApiKey } from "@/lib/data/api-keys";

export async function authenticateApiKey(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  if (!token) {
    return { key: null, error: "Missing API key" };
  }

  const key = await verifyApiKey(token);
  if (!key) {
    return { key: null, error: "Invalid API key" };
  }

  await updateApiKeyLastUsed(key.id);
  return { key, error: null };
}

export async function recordApiKeyUsage(params: {
  keyId: string;
  companyId: string;
  endpoint: string;
  method: string;
  status: number;
  error?: string | null;
}) {
  await logApiKeyUsage(params);
}
