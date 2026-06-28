import { NextResponse } from "next/server";
import type { ApiKeyRecord, ApiKeyScope } from "@/lib/data/api-keys";
import { authenticateApiKey, recordApiKeyUsage } from "@/lib/security/api-keys";

type ExternalApiContext = {
  key: ApiKeyRecord;
  companyId: string;
};

type ExternalApiHandler = (context: ExternalApiContext) => Promise<Response>;

const hasScope = (key: ApiKeyRecord, allowedScopes: ApiKeyScope[]) =>
  allowedScopes.some((scope) => key.scopes.includes(scope));

const requestPath = (request: Request) => new URL(request.url).pathname;

const classifyExternalError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) {
    return 404;
  }
  if (
    normalized.includes("required") ||
    normalized.includes("must") ||
    normalized.includes("first") ||
    normalized.includes("rejected") ||
    normalized.includes("invalid") ||
    normalized.includes("sandbox") ||
    normalized.includes("production") ||
    normalized.includes("compliance")
  ) {
    return 400;
  }
  return 500;
};

export async function withExternalApiAuth(
  request: Request,
  allowedScopes: ApiKeyScope[],
  handler: ExternalApiHandler
) {
  const endpoint = requestPath(request);
  const method = request.method;
  const { key, error } = await authenticateApiKey(request);

  if (!key) {
    await recordApiKeyUsage({
      keyId: "unknown",
      companyId: "unknown",
      endpoint,
      method,
      status: 401,
      error: error ?? "Unauthorized",
    });
    return NextResponse.json({ error: error ?? "Unauthorized" }, { status: 401 });
  }

  if (!hasScope(key, allowedScopes)) {
    await recordApiKeyUsage({
      keyId: key.id,
      companyId: key.companyId,
      endpoint,
      method,
      status: 403,
      error: "Missing required API key scope",
    });
    return NextResponse.json(
      {
        error: "Forbidden",
        requiredScopes: allowedScopes,
      },
      { status: 403 }
    );
  }

  const requestedCompanyId = new URL(request.url).searchParams.get("companyId");
  if (requestedCompanyId && requestedCompanyId !== key.companyId) {
    await recordApiKeyUsage({
      keyId: key.id,
      companyId: key.companyId,
      endpoint,
      method,
      status: 403,
      error: "API key company mismatch",
    });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const response = await handler({ key, companyId: key.companyId });
    await recordApiKeyUsage({
      keyId: key.id,
      companyId: key.companyId,
      endpoint,
      method,
      status: response.status,
      error: response.status >= 400 ? response.statusText : null,
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = classifyExternalError(message);
    await recordApiKeyUsage({
      keyId: key.id,
      companyId: key.companyId,
      endpoint,
      method,
      status,
      error: message,
    });
    return NextResponse.json(
      { error: status === 500 ? "Internal server error" : message },
      { status }
    );
  }
}
