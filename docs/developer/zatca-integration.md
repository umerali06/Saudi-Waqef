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

1. Create a sandbox ZATCA integration and save the mapping.
2. Obtain an OTP from the Fatoora portal and select **Request compliance CSID**.
3. Enter an approved invoice ID and run the six compliance checks (standard/simplified invoice, credit note, and debit note).
4. Request the production CSID.
5. Validate the integration, then sync. Approved invoices and issued credit notes are submitted in creation order.

Repeat onboarding with a production integration before going live. Never copy sandbox CSIDs into production.

## Operational rules

- One sync job runs per integration so invoice counter and previous hash ordering cannot race.
- Accepted documents are not resubmitted. Rejected documents stop the chain and retain ZATCA alerts for correction.
- Standard cleared XML and submitted signed XML are retained with the artifact and can be exported.
- Do not edit or delete an accepted invoice. Corrections must be issued as credit/debit notes.
- Monitor CSID expiry, failed jobs, reporting deadlines, and rejected artifacts.
