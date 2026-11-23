import { ZatcaError, ZatcaErrorCode } from "@/lib/integrations/zatca/errors";
import { zatcaBaseUrl, type ZatcaEnvironment } from "@/lib/integrations/zatca/environment";

export type ZatcaCredentials = { binarySecurityToken: string; secret: string };

export type ZatcaSubmissionBody = { invoiceHash: string; uuid: string; invoice: string };

export type ZatcaAlert = {
  severity: "error" | "warning";
  code: string;
  category: string;
  message: string;
};

export type ZatcaCsid = { binarySecurityToken: string; secret: string; requestId: string };

export type ZatcaVerdict = {
  accepted: boolean;
  httpStatus: number;
  alerts: ZatcaAlert[];
  reportingStatus: string | null;
  clearanceStatus: string | null;
  /** Base64 UBL stamped by ZATCA. Only returned when a standard invoice is cleared. */
  clearedInvoice: string | null;
  /** ZATCA already holds this exact document from an earlier attempt. */
  alreadySubmitted: boolean;
};

export type ZatcaReply = { status: number; json: Record<string, unknown> | null; text: string };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const str = (value: unknown) => (typeof value === "string" ? value : "");

const alertsFrom = (value: unknown, severity: ZatcaAlert["severity"]): ZatcaAlert[] =>
  (Array.isArray(value) ? value : value ? [value] : []).map((entry) => {
    const row = record(entry);
    return {
      severity,
      code: str(row?.code),
      category: str(row?.category),
      message: str(row?.message) || (typeof entry === "string" ? entry : ""),
    };
  });

export const extractZatcaAlerts = (json: Record<string, unknown> | null): ZatcaAlert[] => {
  if (!json) return [];
  const validation = record(json.validationResults);
  return [
    ...alertsFrom(validation?.errorMessages, "error"),
    ...alertsFrom(json.errors, "error"),
    ...alertsFrom(validation?.warningMessages, "warning"),
  ];
};

/** Human-readable reason for a failed call, including plain-text gateway replies. */
const failureMessage = (reply: ZatcaReply, fallback: string) => {
  const alert = extractZatcaAlerts(reply.json).find((item) => item.message);
  if (alert) return alert.message;
  const direct = str(reply.json?.message) || str(reply.json?.dispositionMessage);
  if (direct) return direct;
  return reply.text.trim().slice(0, 300) || fallback;
};

/**
 * Interprets a clearance/reporting reply. Acceptance is only ever inferred from
 * an explicit ZATCA verdict -- an unrecognised 2xx body is not an acceptance.
 */
export const interpretSubmissionReply = (
  operation: "clearance" | "reporting",
  reply: ZatcaReply
): ZatcaVerdict => {
  const reportingStatus = str(reply.json?.reportingStatus) || null;
  const clearanceStatus = str(reply.json?.clearanceStatus) || null;
  const alreadySubmitted = reply.status === 409;
  const explicit =
    operation === "clearance" ? clearanceStatus === "CLEARED" : reportingStatus === "REPORTED";
  return {
    accepted: alreadySubmitted || ((reply.status === 200 || reply.status === 202) && explicit),
    httpStatus: reply.status,
    alerts: extractZatcaAlerts(reply.json),
    reportingStatus,
    clearanceStatus,
    clearedInvoice: str(reply.json?.clearedInvoice) || null,
    alreadySubmitted,
  };
};

/** A document passes a compliance check only on an explicit PASS/WARNING verdict. */
export const interpretComplianceReply = (reply: ZatcaReply) => {
  const alerts = extractZatcaAlerts(reply.json);
  const verdict = str(record(reply.json?.validationResults)?.status).toUpperCase();
  const valid =
    (reply.status === 200 || reply.status === 202) &&
    (verdict === "PASS" || verdict === "WARNING") &&
    !alerts.some((alert) => alert.severity === "error");
  if (!valid && alerts.length === 0) {
    alerts.push({
      severity: "error",
      code: `HTTP_${reply.status}`,
      category: "HTTP",
      message: failureMessage(reply, "ZATCA returned no validation verdict."),
    });
  }
  return { valid, httpStatus: reply.status, alerts };
};

export class ZatcaApi {
  private readonly baseUrl: string;

  constructor(
    environment: ZatcaEnvironment,
    private readonly timeoutMs = 30000
  ) {
    this.baseUrl = zatcaBaseUrl(environment);
  }

  private async post(
    path: string,
    body: unknown,
    headers: Record<string, string>
  ): Promise<ZatcaReply> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Language": "en",
          "Accept-Version": "V2",
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        redirect: "manual",
      });
      const text = await response.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = record(JSON.parse(text));
      } catch {
        json = null;
      }
      return { status: response.status, json, text };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ZatcaError(
          `ZATCA did not respond within ${this.timeoutMs} ms.`,
          ZatcaErrorCode.API_TIMEOUT
        );
      }
      throw new ZatcaError(
        `ZATCA could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        ZatcaErrorCode.API_CONNECTION_ERROR
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private basic(credentials: ZatcaCredentials) {
    const token = `${credentials.binarySecurityToken}:${credentials.secret}`;
    return { Authorization: `Basic ${Buffer.from(token).toString("base64")}` };
  }

  private parseCsid(reply: ZatcaReply, fallback: string): ZatcaCsid {
    const binarySecurityToken = str(reply.json?.binarySecurityToken);
    const secret = str(reply.json?.secret);
    const rawRequestId = reply.json?.requestID ?? reply.json?.requestId;
    const requestId =
      rawRequestId === undefined || rawRequestId === null ? "" : String(rawRequestId);
    if (reply.status !== 200 || !binarySecurityToken || !secret || !requestId) {
      const message = failureMessage(reply, fallback);
      throw new ZatcaError(
        message,
        reply.status >= 500 ? ZatcaErrorCode.API_CONNECTION_ERROR : ZatcaErrorCode.API_ERROR,
        { message, httpStatus: reply.status }
      );
    }
    return { binarySecurityToken, secret, requestId };
  }

  async issueComplianceCsid(csrPem: string, otp: string) {
    const reply = await this.post(
      "/compliance",
      { csr: Buffer.from(csrPem).toString("base64") },
      { OTP: otp }
    );
    return this.parseCsid(reply, "ZATCA rejected the compliance certificate request.");
  }

  async issueProductionCsid(credentials: ZatcaCredentials, complianceRequestId: string) {
    const reply = await this.post(
      "/production/csids",
      { compliance_request_id: complianceRequestId },
      this.basic(credentials)
    );
    return this.parseCsid(reply, "ZATCA rejected the production certificate request.");
  }

  /** Validates a document against ZATCA's rules without filing it. */
  async checkCompliance(credentials: ZatcaCredentials, body: ZatcaSubmissionBody) {
    return interpretComplianceReply(
      await this.post("/compliance/invoices", body, this.basic(credentials))
    );
  }

  async submit(
    operation: "clearance" | "reporting",
    credentials: ZatcaCredentials,
    body: ZatcaSubmissionBody
  ): Promise<ZatcaVerdict & { operation: "clearance" | "reporting" }> {
    const path =
      operation === "clearance" ? "/invoices/clearance/single" : "/invoices/reporting/single";
    const reply = await this.post(path, body, {
      ...this.basic(credentials),
      "Clearance-Status": operation === "clearance" ? "1" : "0",
    });
    // 303: ZATCA has switched clearance off, so the document must be reported.
    if (operation === "clearance" && reply.status === 303) {
      return this.submit("reporting", credentials, body);
    }
    const verdict = interpretSubmissionReply(operation, reply);
    if (!verdict.accepted && verdict.alerts.length === 0) {
      verdict.alerts.push({
        severity: "error",
        code: `HTTP_${reply.status}`,
        category: "HTTP",
        message: failureMessage(reply, "ZATCA returned no verdict."),
      });
    }
    return { ...verdict, operation };
  }
}
