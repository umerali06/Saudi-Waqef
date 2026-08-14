# ZATCA Sandbox Test Guide for Client

This guide explains how to test ZATCA Phase 2 integration from zero using the
raw external API (`curl`/API key) -- for a developer or technical
integrator. If you just want to click through the app's own setup screens
with no API key, use `zatca-beginner-setup-guide.md` instead.

Important: the general External API test proves ERP/API access. ZATCA testing is a separate flow because ZATCA requires Sandbox onboarding, CSR generation, CSID certificates, XML signing, compliance checks, and invoice submission.

## What is implemented

The system now has a dedicated ZATCA Integration Layer.

Available API-key endpoints:

| Step | Endpoint |
| --- | --- |
| Check ZATCA endpoint list | `GET /api/external/v1/zatca` |
| Check integration/onboarding status | `GET /api/external/v1/zatca/status?integrationId=<ID>` |
| Request compliance CSID | `POST /api/external/v1/zatca/csid/request` |
| Run six compliance checks | `POST /api/external/v1/zatca/compliance/check` |
| Request production/simulation CSID | `POST /api/external/v1/zatca/production/csid` |
| Sign invoice XML | `POST /api/external/v1/zatca/invoice/sign` |
| Submit invoices/credit notes | `POST /api/external/v1/zatca/production/submit` |

Alias routes also work under `/external/v1/zatca/...`.

## Required API key scopes

The API key must include:

- `read:accounting`
- `write:accounting`
- `read:reports`

If the key does not include `write:accounting`, CSID, signing, compliance, and submission tests will return `403 Forbidden`.

## Before testing

You need these items:

1. Application base URL, for example:

   ```text
   https://your-domain.com
   ```

2. API key:

   ```text
   YOUR_API_KEY
   ```

3. ZATCA integration ID:

   ```text
   YOUR_ZATCA_INTEGRATION_ID
   ```

4. One approved invoice ID from the same company:

   ```text
   YOUR_APPROVED_INVOICE_ID
   ```

5. Sandbox OTP from Fatoora portal.

The OTP must be generated from ZATCA/Fatoora Sandbox. Without OTP, the CSID request cannot be completed.

## Required company data

Before running CSID request, confirm the company profile has:

- Legal company name
- VAT number
- Commercial registration number
- Saudi address
- Currency: `SAR`
- Timezone: Saudi timezone is recommended for live use

The ZATCA integration mapping should include:

```json
{
  "sellerNameAr": "اسم المنشأة بالعربية",
  "egsSerialNumber": "EGS-001",
  "invoiceType": "1100",
  "businessCategory": "Accounting",
  "sellerAddress": {
    "street": "King Fahd Road",
    "building": "1234",
    "district": "Al Olaya",
    "city": "Riyadh",
    "postalCode": "12211",
    "countryCode": "SA"
  }
}
```

## Beginner PowerShell setup

Open PowerShell and set variables:

```powershell
$BASE_URL = "https://your-domain.com"
$API_KEY = "YOUR_API_KEY"
$INTEGRATION_ID = "YOUR_ZATCA_INTEGRATION_ID"
$INVOICE_ID = "YOUR_APPROVED_INVOICE_ID"
$OTP = "ZATCA_SANDBOX_OTP"
```

## Test 1: Check external API authentication

```powershell
curl.exe -i `
  -H "Authorization: Bearer $API_KEY" `
  "$BASE_URL/api/external/v1/ping"
```

Expected:

- HTTP `200`
- Response contains `ok: true`
- Response contains company ID and scopes

## Test 2: Check ZATCA connector availability

```powershell
curl.exe -i `
  -H "Authorization: Bearer $API_KEY" `
  "$BASE_URL/api/external/v1/zatca"
```

Expected:

- HTTP `200`
- Response lists ZATCA endpoints

## Test 3: Check current ZATCA status

```powershell
curl.exe -i `
  -H "Authorization: Bearer $API_KEY" `
  "$BASE_URL/api/external/v1/zatca/status?integrationId=$INTEGRATION_ID"
```

Expected before onboarding:

```json
{
  "data": {
    "onboardingStatus": "not_started"
  }
}
```

If onboarding was started earlier, status may be:

- `compliance_csid_issued`
- `compliance_verified`
- `production_ready`

## Test 4: Request Compliance CSID

This step generates CSR internally and sends it to ZATCA Sandbox with the OTP.

```powershell
curl.exe -i `
  -X POST `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  -d "{`"integrationId`":`"$INTEGRATION_ID`",`"otp`":`"$OTP`"}" `
  "$BASE_URL/api/external/v1/zatca/csid/request"
```

Expected:

- HTTP `200`
- `ok: true`
- `onboardingStatus: compliance_csid_issued`

If OTP is wrong or expired, ZATCA will reject the request. Generate a new OTP and retry.

## Test 5: Run the ZATCA compliance test batch (11 scenarios)

This builds and submits 11 self-contained signed sample documents to ZATCA Sandbox
(no real invoice needed -- the endpoint no longer takes an `invoiceId`):

1. Standard invoice
2. Standard credit note
3. Standard debit note
4. Simplified invoice
5. Simplified credit note
6. Simplified debit note
7. Standard invoice with a line-level discount
8. Standard invoice with a header-level charge
9. Standard invoice with multiple tax categories (standard + zero-rated lines)
10. Standard invoice with a VAT-exempt line
11. Standard invoice with a negative-quantity return line (reported, but does not gate onboarding -- ZATCA may legitimately reject it since returns should go through credit notes)

```powershell
curl.exe -i `
  -X POST `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  -d "{`"integrationId`":`"$INTEGRATION_ID`"}" `
  "$BASE_URL/api/external/v1/zatca/compliance/check"
```

Expected:

- HTTP `200`
- `ok: true`
- 11 checks returned in `checks`, each tagged with `scenarioId` and `gating`
- Every check with `gating: true` has `valid: true` (10 of 11 -- the return-line scenario is excluded from gating)
- `onboardingStatus: compliance_verified`

If a gating check fails, the response is HTTP `422` and includes ZATCA's messages for each failed scenario.

## Test 6: Request production/simulation CSID

In Sandbox this creates the CSID used for Sandbox submission tests.

```powershell
curl.exe -i `
  -X POST `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  -d "{`"integrationId`":`"$INTEGRATION_ID`"}" `
  "$BASE_URL/api/external/v1/zatca/production/csid"
```

Expected:

- HTTP `200`
- `ok: true`
- `onboardingStatus: production_ready`

## Test 7: Sign one invoice

This confirms that the system can generate UBL XML, sign it digitally, generate invoice hash, and generate Phase 2 QR.

```powershell
curl.exe -i `
  -X POST `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  -d "{`"integrationId`":`"$INTEGRATION_ID`",`"invoiceId`":`"$INVOICE_ID`"}" `
  "$BASE_URL/api/external/v1/zatca/invoice/sign"
```

Expected:

- HTTP `200`
- `ok: true`
- Response contains:
  - `uuid`
  - `invoiceHash`
  - `qrCodeBase64`
  - `signedXmlBase64`

## Test 8: Submit approved invoices and issued credit notes

This submits eligible approved/sent/paid invoices and issued credit notes to ZATCA Sandbox.

```powershell
curl.exe -i `
  -X POST `
  -H "Authorization: Bearer $API_KEY" `
  -H "Content-Type: application/json" `
  -d "{`"integrationId`":`"$INTEGRATION_ID`"}" `
  "$BASE_URL/api/external/v1/zatca/production/submit"
```

Expected success:

- HTTP `200`
- `ok: true`
- Each submitted document shows `accepted`

Possible failure:

- HTTP `422`
- One or more documents were rejected by ZATCA
- Response contains ZATCA alerts/messages

## Test 9: Check artifacts/status after submission

```powershell
curl.exe -i `
  -H "Authorization: Bearer $API_KEY" `
  "$BASE_URL/api/external/v1/zatca/status?integrationId=$INTEGRATION_ID"
```

Expected:

- Latest artifacts show:
  - invoice ID
  - ZATCA UUID
  - status: `accepted`, `rejected`, or `submitted`
  - last response from ZATCA

## Common errors

### 401 Unauthorized

Cause:

- Missing API key
- Wrong API key
- Revoked API key

Fix:

- Use `Authorization: Bearer YOUR_API_KEY`

### 403 Forbidden

Cause:

- API key is valid but missing required scope

Fix:

- Add `write:accounting` for ZATCA onboarding/signing/submission
- Add `read:accounting` for status checks

### 400 Bad Request

Common causes:

- Missing `integrationId`
- Missing `otp`
- Missing `invoiceId`
- Company VAT/CR missing
- Integration is not Sandbox for compliance test
- Compliance CSID was not requested before compliance check

### 422 Unprocessable Entity

Cause:

- ZATCA rejected one or more compliance/submission documents

Fix:

- Read the ZATCA messages in the response
- Correct invoice/company/address/tax data
- Retry the failed step

## What to send back to development team if test fails

Send:

1. Endpoint URL
2. HTTP method
3. HTTP status code
4. Request body without API key
5. Full response body
6. Integration ID
7. Invoice ID used for testing
8. Screenshot or copied text from ZATCA/Fatoora OTP page if OTP-related

Do not send the API key, CSID token, secret, private key, or certificate.
