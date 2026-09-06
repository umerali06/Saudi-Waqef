# Fawrah ERP — ZATCA Phase 2 production-readiness record

Last audited: 2026-09-06

Authority baseline: ZATCA E-Invoice Specifications, XML Implementation Standard v1.2 (19 May 2023), Security Features Implementation Standards (19 May 2023), and the current Developer Portal/SDK material. Re-check the official ZATCA developer pages before every production release.

This is the single source of truth for implementation state, evidence, risks, and remaining acceptance work. `DONE` means implemented and covered by local evidence. It does **not** mean ZATCA accepted a real document. Any item requiring an OTP, CSID, Sandbox/Simulation response, Production authorization, screenshot, backup restore, or operational drill remains partial until that evidence is attached.

## Architecture and safety invariants

- Every integration and artifact carries `companyId`; user-facing reads are company-scoped. Artifact lookup uses both company and business document ID.
- Integration credentials, CSIDs, certificate material, and private keys are AES-256-GCM encrypted in `credentialsEnc` using `APP_ENCRYPTION_KEY`. Secret fields are redacted from logs.
- One integration represents one company/EGS/environment. Never reuse it across companies or environments.
- XML is generated from approved ERP transactions. Users do not edit signed XML.
- A Firestore transaction-backed mutex serializes submission per integration; PIH/ICV advances only after acceptance.
- The artifact is mutable, while each submission attempt is appended under `zatca_artifacts/{artifactId}/attempts/{attemptId}` so retries cannot erase evidence.

## Acceptance checklist

| # | Requirement | Status | Evidence / code reference | Remaining work |
|---|---|---|---|---|
| 1 | Tenant isolation | PARTIALLY DONE | `integrations.ts`, `zatca-artifacts.ts`, `onboarding.ts`; company-scoped lookup | Run two-company Firestore/Sandbox isolation test. |
| 2 | Business validation | PARTIALLY DONE | `company-info.ts` rejects invalid VAT, missing legal/CR data, incomplete seller and buyer address; structured buyer address on the customer record | Localized field-level errors on the customer form. |
| 3 | Onboarding | PARTIALLY DONE | `onboarding.ts`: key/CSR, OTP, compliance CSID/checks, production CSID, encrypted storage | Attach real Sandbox and authorized Production evidence; add renewal. |
| 4 | Compliance testing | PARTIALLY DONE | Official document types plus calculation shapes; responses retained | Revalidate registry with current ZATCA SDK/specification; never treat a fixed count as the rule. |
| 5 | Invoice XML | PARTIALLY DONE | `service.ts` maps ERP lines/tax/totals/UUID/PIH/ICV; library generates/signs UBL; buyer-address placeholders removed | Validate samples with current official SDK. |
| 6 | Standard B2B | PARTIALLY DONE | Clearance profile and cleared response/XML retention | Attach Sandbox lifecycle and ERP screenshot. |
| 7 | Simplified B2C | PARTIALLY DONE | Reporting profile, signature/QR, 24-hour due time, scheduled catch-up | Prove rejection/outage/retry with Sandbox evidence. |
| 8 | Credit notes | PARTIALLY DONE | Type 381 with original number/UUID/date | Attach accounting reconciliation and Sandbox result. |
| 9 | Debit notes | PARTIALLY DONE | `sales_debit_notes` collection, journal posting, type 383 with original reference, list/create/detail UI, create-from-invoice card | Attach Sandbox result and accounting reconciliation. |
| 10 | QR | PARTIALLY DONE | Phase 2 QR generated from signed data and stored | Add decode assertions/rendering evidence. |
| 11 | Cryptography | PARTIALLY DONE | EC key, AES-256-GCM, TLS, redaction | Use managed KMS/HSM and run cross-tenant extraction test. |
| 12 | Hash chain | PARTIALLY DONE | deterministic UUID, per-integration lock, transactional chain update | Add lock heartbeat and automated lock-loss recovery; concurrency evidence. |
| 13 | Anti-tampering | PARTIALLY DONE | submission restricted to approved/issued documents; edits limited to drafts; `finality.ts` blocks canceling a ZATCA-accepted invoice | Extend the finality guard as new mutation endpoints are added. |
| 14 | Status model | DONE | full technical state set written and surfaced; `retry_pending` and `integration_unavailable` now actually reached; localized labels and filters in the admin UI | Re-check against ZATCA vocabulary changes. |
| 15 | Error handling | PARTIALLY DONE | normalized/redacted errors, HTTP alerts, append-only attempts; transport failures persisted as `integration_unavailable` attempts | Localized correction guidance per rejection reason. |
| 16 | Retry/idempotency | PARTIALLY DONE | deterministic UUID, accepted skip, mutex, attempt history, `failure-classification.ts` (retryable/permanent/blocked), backoff honoured before re-submission | Sub-daily scheduler so backoff can expire sooner than the daily cron. |
| 17 | Outage handling | PARTIALLY DONE | scheduled catch-up, SLA alerts, transport failures held as pending with backoff instead of being marked rejected | Queue at issuance; execute outage recovery test. |
| 18 | Audit trail | PARTIALLY DONE | onboarding/sync audits, append-only attempts, renewal success/failure with certificate expiry metadata, log exports | Add previous/new status to every artifact transition. |
| 19 | Logs screen | PARTIALLY DONE | all 9 required columns, six filters, search, pagination, structured detail drawer with per-attempt timeline, redacted filter-aware CSV/JSON export | Loading/error states; resubmit action from a row. |
| 20 | Certificate lifecycle | PARTIALLY DONE | parsed expiry, 30/14/7/1-day alerts, OTP renewal with full re-verification, single terminal swap, superseded credential retained for rollback | Surface expiry date in the UI; add an operator-facing rollback action. |
| 21 | Environment separation | DONE | environment selects endpoints/credentials, locked once onboarding starts, and production activation requires an explicit confirmation phrase | Re-verify after any ZATCA endpoint change. |
| 22 | Arabic/English UX | PARTIALLY DONE | bilingual wizard, errors, logs filters, status/environment/operation labels, renewal panel, buyer-address form; RTL shell | Arabic rendering QA on printed documents. |
| 23 | Permissions | PARTIALLY DONE | owner/admin onboarding; accounting API scope | Dedicated technical-log permission and endpoint audit. |
| 24 | Accounting integration | PARTIALLY DONE | XML derives from posted ERP totals/issued credit notes | Journal-tax-XML invariant tests and debit-note posting. |
| 25 | VAT calculations | PARTIALLY DONE | standard/zero/exempt/discount/multiple lines | Reason codes, rounding stress tests, official SDK evidence. |
| 26 | Retention/backup | PARTIALLY DONE | signed XML/QR/responses/attempts persist | Legal duration, encrypted backup, restore/chain drill. |
| 27 | Monitoring | PARTIALLY DONE | certificate, reporting SLA, rejection-spike, stalled-queue and integration-unhealthy (incl. lock loss) alerts with cooldown | Tune thresholds against real Sandbox volume. |
| 28 | End-to-end tests A–J | NOT IMPLEMENTED | Unit tests cover mapping/normalization | Execute all credentialed/operational flows. |
| 29 | Evidence package | NOT IMPLEMENTED | Layout below | Produce from sanitized real runs only. |
| 30 | Developer confirmation | DONE | This checklist and remaining-work register | Update with every ZATCA change. |

## Remaining ZATCA Work

Release is blocked until these are complete:

1. Sub-daily scheduling. Failure classification and backoff are implemented and honoured, but Vercel's current plan only allows one cron run per day, so a document whose backoff expires mid-day waits for the next run. Moving to a shorter cron interval closes this.
2. Operator-facing certificate rollback. The superseded credential is now retained on renewal; the action to restore it still has to be exposed in the UI, together with the certificate expiry date.
3. KMS/HSM-backed envelope encryption and key rotation.
4. Loading and error states on the logs screen, and a resubmit action from a log row.
5. Validate invoice, simplified invoice, credit note and debit note XML with the current official SDK.
6. Structured buyer address backfill for customers created before the field existed; standard invoices for those customers fail until the address is completed.
7. Execute acceptance tests A-J, including two companies and concurrent submissions.
8. Complete Sandbox/Simulation evidence. Production onboarding requires the customer's authorized ZATCA account and cannot be simulated locally.
9. Complete backup/restore and chain-continuity evidence.

## Evidence package

```text
delivery/zatca-evidence/
  README.md
  architecture.md
  environment-and-endpoints.md
  sandbox/onboarding.json
  sandbox/compliance-results.json
  sandbox/b2b.xml
  sandbox/b2b-response.json
  sandbox/b2c.xml
  sandbox/b2c-response.json
  sandbox/credit-note.xml
  sandbox/debit-note.xml
  sandbox/rejection-retry.json
  screenshots/
  security-and-key-storage.md
  certificate-renewal.md
  backup-and-recovery.md
  remaining-work.md
```

Scan the folder for private keys, OTPs, Basic auth headers, CSID secrets, tokens, passwords, and reusable production identifiers. Review screenshots manually.

## Release gate

Do not call the integration production-ready until real sanitized evidence demonstrates:

`ERP transaction → validated UBL → ZATCA clearance/reporting → final status → matching accounting record → append-only audit evidence`

Official references: ZATCA E-Invoice Specifications, Security Requirements, Developer Portal Manual, and Compliance and Enablement Toolbox SDK pages on `zatca.gov.sa`.
