# ZATCA Phase 2 integration

The application implements Fatoora onboarding, UBL 2.1 generation, ECDSA-SHA256 XML signing, Phase 2 TLV QR codes, compliance checks, standard-invoice clearance, simplified-invoice reporting, credit notes, and the PIH/ICV hash chain.

## Required configuration

Set `APP_ENCRYPTION_KEY` to a random 32-byte base64 value before creating integrations. Credentials, CSIDs, certificates, and private keys are encrypted with AES-256-GCM. Run migration `2026-06-20-encrypt-integration-credentials` once when upgrading an existing deployment.

In the integration mapping JSON, configure the registered EGS unit and seller address:

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

The company profile must contain its legal name, VAT number, and commercial registration number. Standard invoices also require a VAT-registered buyer. The connector selects clearance for buyers with a VAT number and reporting otherwise.

## Onboarding

Business owners and accountants onboard through the guided wizard at
`/settings/integrations/zatca` (4 steps: business details → mandatory Fatoora
Portal OTP verification → fully automatic certificate/compliance/production
linking → connection status). No raw technical fields (endpoints, auth type,
PEM, JSON) are shown there. The wizard drives the same underlying steps as
before:

1. Create a sandbox ZATCA integration.
2. Obtain an OTP from the Fatoora Portal and request the compliance CSID.
3. Run the compliance test batch -- 11 self-contained scenarios (the 6 ZATCA
   canonical types plus 5 "special case" documents: line-level discount,
   header-level charge, multiple tax categories, a VAT-exempt line, and a
   negative-quantity return line). None of them require a real invoice to
   exist yet. The return-line scenario is reported but excluded from the
   pass/fail gate since ZATCA may legitimately reject it.
4. Request the production CSID.
5. Validate the integration, then sync. Approved invoices and issued credit
   notes are submitted in creation order.

The old developer-facing 3-button onboarding panel and raw-JSON preview on
the generic Integrations settings page have been removed for the `zatca`
connector; that page now links out to the wizard instead. `verifyZatcaCompliance`
no longer takes an `invoiceId` parameter.

Repeat onboarding with a production integration before going live. Never copy sandbox CSIDs into production.

## External ZATCA connector API

The ZATCA connector is also exposed through API-key routes for external integration testing:

- `GET /api/external/v1/zatca`
- `GET /api/external/v1/zatca/status?integrationId=<ID>`
- `POST /api/external/v1/zatca/csid/request`
- `POST /api/external/v1/zatca/compliance/check`
- `POST /api/external/v1/zatca/production/csid`
- `POST /api/external/v1/zatca/invoice/sign`
- `POST /api/external/v1/zatca/production/submit`

Alias routes are also available under `/external/v1/zatca/...`.

Beginner (no-API-key, click-through) guide: `docs/developer/zatca-beginner-setup-guide.md`.
Developer/API test guide: `docs/developer/zatca-sandbox-test-guide.md`.

## Operational rules

- `executeZatcaSubmission` acquires a per-integration Firestore lock (`zatca_submission_locks/{integrationId}`, `submission-lock.ts`) before touching the hash chain, so overlapping sync attempts (a manual "Sync Now" racing the reporting-SLA cron, for example) cannot corrupt the invoice counter / previous-hash ordering -- the second caller gets a clean `ZATCA_LOCK_HELD` rejection instead of a corrupted chain. If the lock is lost mid-run after a document was already accepted by ZATCA, that acceptance is still recorded in `zatca_artifacts`, the run stops, and `config.zatcaHashChain` needs a manual resync from the latest accepted artifact (this is a rare edge case, not a routine occurrence).
- Accepted documents are not resubmitted. Rejected documents stop the chain and retain ZATCA alerts for correction.
- Standard cleared XML and submitted signed XML are retained with the artifact and can be exported.
- Do not edit or delete an accepted invoice. Corrections must be issued as credit/debit notes.
- Two scheduled jobs (Vercel Cron, see `vercel.json`, gated by `CRON_SECRET` via `src/lib/security/cron-auth.ts`) now cover monitoring:
  - `GET /api/cron/zatca/certificate-expiry` (daily) -- alerts company owners/admins at 30/14/7/1 days before CSID expiry, and flags the integration once actually expired.
  - `GET /api/cron/zatca/reporting-sla` (every 30 min) -- attempts a catch-up submission for every active integration (this is currently the only scheduled trigger that submits pending invoices at all), then alerts on B2C/reporting documents within 4h of their 24h ZATCA deadline, self-healing via ZATCA's status API first in case they were already accepted.
