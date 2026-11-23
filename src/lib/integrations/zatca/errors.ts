export const ZatcaErrorCode = {
  API_ERROR: "API_ERR",
  API_CONNECTION_ERROR: "API_CONN_ERR",
  API_TIMEOUT: "API_TIMEOUT_ERR",
  CERT_ERROR: "CERT_LOAD_ERR",
  SIGN_ERROR: "SIGN_ERR",
  VALIDATION_ERROR: "VALIDATION_ERR",
} as const;

export type ZatcaErrorCode = (typeof ZatcaErrorCode)[keyof typeof ZatcaErrorCode];

export class ZatcaError extends Error {
  constructor(
    message: string,
    readonly code: ZatcaErrorCode,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ZatcaError";
  }
}
