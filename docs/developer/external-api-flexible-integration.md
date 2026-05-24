# External API Flexible Integration

This platform supports a generic integration contract that can be used for ZATCA and any third-party API.

## Integration execution model

- Create integration in `/api/integrations` with connector `custom` (or `zatca`, `gosi`, `mudad`).
- Run connectivity test via `/api/integrations/{integrationId}/test`.
- Run sync via `/api/integrations/{integrationId}/sync`.
- Every run writes:
  - integration job (`integration_jobs`)
  - integration log (`integration_logs`)
  - status/last error on integration record

## Generic config keys

Use these keys inside `integration.config`:

- `endpoint`: base endpoint URL
- `testEndpoint`, `syncEndpoint`: optional mode-specific URLs
- `testPath`, `syncPath`: optional relative path appended to endpoint
- `testMethod`, `syncMethod`: HTTP method (`GET`, `POST`, etc.)
- `timeoutMs`: 1000-60000
- `retries`: 1-5
- `retryBackoffMs`: 200-5000
- `retryOnStatus`: array of status codes to retry (optional)
- `authType`: `bearer` | `api_key` | `basic` | `none`
- `apiKeyHeader`: header key when `authType=api_key`
- `headers`: object of custom headers
- `idempotencyHeader`: optional custom idempotency header name
- `includeDatasets`: optional dataset paths to include from base payload
- `payloadMode`: `base` | `fields` | `template`
- `mapping`: object used by `fields` mode (`target.path`: `source.path`)
- `payloadTemplate`: object used by `template` mode with `{{path.to.value}}` placeholders
- `callbackUrl`: optional webhook URL to receive run result summary

Credentials are stored in `integration.credentials` (for example `apiKey`, `username`, `password`).

## Payload modes

### 1) Base mode
- Sends a standard business payload containing:
  - employees
  - payroll
  - attendance
  - sales invoices
  - purchase bills

### 2) Fields mode
- Build outbound payload by selecting specific source fields.
- Example:

```json
{
  "payloadMode": "fields",
  "mapping": {
    "tenant.id": "companyId",
    "summary.invoiceCount": "sales.invoiceCount",
    "summary.billCount": "purchases.billCount"
  }
}
```

### 3) Template mode
- Build outbound payload from a JSON template with placeholders.
- Example:

```json
{
  "payloadMode": "template",
  "payloadTemplate": {
    "meta": {
      "connector": "{{connector}}",
      "companyId": "{{companyId}}"
    },
    "totals": {
      "employees": "{{employees.total}}",
      "invoices": "{{sales.invoiceCount}}"
    }
  }
}
```

## Idempotency and correlation

- Each run sends a stable idempotency/correlation key.
- Default header:
  - `X-Correlation-Id` for ZATCA
  - `Idempotency-Key` for other connectors
- Can be overridden with `idempotencyHeader`.

## Callback/webhook

If `callbackUrl` is set, system sends result summary after the integration request:

- mode
- connector/company/integration identifiers
- idempotency key
- HTTP result, duration, attempt count, body preview

## ZATCA on top of generic contract

Use connector `zatca` and configure:

- endpoint/test/sync URLs
- required credentials
- idempotency/correlation header
- payload mapping/template aligned with ZATCA schema

This keeps ZATCA-specific behavior as configuration, while preserving reusable infrastructure for future ERP/reporting/financial integrations.
