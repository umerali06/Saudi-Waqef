# ZATCA Setup Guide for Beginners (No Coding, No API Keys)

This guide is for a business owner or accountant setting up ZATCA e-invoicing
through the app's own screens -- no `curl`, no API keys, no technical fields.
If you are a developer testing the raw API instead, use
`zatca-sandbox-test-guide.md` next to this file.

The whole setup is 4 simple steps and takes about 5 minutes of your own
clicking, plus one manual step ZATCA itself requires (Step 2 below cannot be
skipped or automated -- ZATCA insists the business owner personally confirms
their identity through ZATCA's own portal).

## Before you start

Make sure these two things are true first:

1. **Your VAT number is saved on your company profile.**
   Go to **Settings → Company Profile** and confirm the VAT number and legal
   name are filled in. If the VAT number is missing, add it there first --
   the ZATCA wizard will not let you start without it.
2. **You are logged in as the business owner or an admin.**
   Only the `owner` or `admin` role can set up ZATCA. If you see a message
   saying integration settings are for admins only, ask your account owner
   to either do this step or grant you the admin role.

You will also need, at the moment you reach Step 2 below:

- Your business's own login to ZATCA's Fatoora Portal (the same account
  your business uses to deal with ZATCA directly).

## Where to go

Open **Settings → Integrations**, then click **Start setup** on the "Set up
ZATCA e-invoicing" card (or **Manage** if you already started once before).
This takes you to the guided wizard at `/settings/integrations/zatca`.

## Step 1: Business details

You'll see your VAT number and legal name, read from your company profile --
you don't type anything here. Click **Start ZATCA Integration**.

- If the button is disabled with a message about a missing VAT number, go
  back and fix your company profile first (see "Before you start" above).

## Step 2: Identity verification (the one manual step)

This is the step ZATCA itself requires a human to do -- it cannot be
skipped or done on your behalf by the app or by support.

1. Click **Open Fatoora Portal**. It opens ZATCA's own portal in a new
   browser tab.
2. Log in to that portal using your **business's** ZATCA/Fatoora account
   (not your app login -- this is a completely separate ZATCA website).
3. On ZATCA's portal, request a one-time code (OTP).
4. Copy that code, come back to this app's tab, paste it into the
   **One-time code** field, and click **Confirm**.

Important: that code expires quickly. Don't copy it and then go make coffee
-- paste it in and confirm within a minute or two, or you'll need to go back
to ZATCA's portal and request a fresh one.

## Step 3: Linking in progress (fully automatic -- just watch)

After you confirm the code, the app does everything else by itself. You'll
see a short checklist update in real time:

1. "Generating your digital certificate" -- creates a private key and
   certificate request behind the scenes.
2. "Running compliance checks (11 test documents)" -- sends 11 sample
   invoices/credit notes/debit notes to ZATCA's sandbox to prove the setup
   is correct. This is required by ZATCA before it will trust your real
   certificate.
3. "Requesting your production certificate" -- once all required checks
   pass, the app requests your real, 3-year ZATCA certificate.

This normally finishes in under a minute. Don't refresh the page while it's
running -- if you do, it will safely pick up wherever it left off.

## Step 4: Connection status

Once Step 3 finishes, you land on a status screen that stays your home base
for ZATCA going forward. It shows one of three states:

- 🟡 **In Testing (Sandbox)** -- setup is done, but you're still on ZATCA's
  test environment, not sending real government-recognized invoices yet.
- 🟢 **Active - Production** -- you're fully live. Real invoices your
  business issues will now be reported/cleared with ZATCA automatically.
- **Connection Failed** -- something didn't go through. See "If something
  goes wrong" below.

On this screen you also have:

- **Test Connection** -- click any time to double-check everything still
  talks to ZATCA correctly. It shows a plain result (pass/fail) plus
  ZATCA's own response underneath, for reference.
- **View Logs** -- hidden by default (on purpose, to keep this screen
  simple). Click it to see a list of invoices/credit notes that have been
  sent to ZATCA and whether each was accepted or rejected.

## If something goes wrong

The app translates ZATCA's technical errors into plain language. Here's what
each message you might see actually means:

| What you see | What it means | What to do |
| --- | --- | --- |
| "The one-time code has expired or is incorrect..." | The OTP from Step 2 timed out or was mistyped. | Click Retry, go back to the Fatoora Portal, get a fresh code, and confirm again quickly. |
| "ZATCA rejected the registration request..." | Something in your VAT number or company details doesn't match what ZATCA has on file. | Double-check your company profile details match your official ZATCA registration exactly, then retry. |
| "Some of the required compliance test documents did not pass..." | One of the 11 automatic test documents failed ZATCA's review. | This usually needs a technical look -- contact support with the integration ID. |
| "We couldn't reach ZATCA's service right now..." | ZATCA's own systems are temporarily unreachable. | Wait a few minutes and click Retry. This is not something wrong on your side. |
| "Another sync was already running..." | The app was already talking to ZATCA (e.g. an automatic background check) when you tried something else. | Wait a minute and try again -- this protects your invoice numbering, it's not a failure. |
| "Your ZATCA certificate has expired..." | Your 3-year production certificate ran out. | Contact support to renew it -- new invoices can't be sent to ZATCA until it's renewed. |

If none of these match exactly, click **Retry** once; if it still fails,
contact support and include:

1. Your company name and the approximate time you tried.
2. A screenshot of the exact message shown on the Connection Failed screen.
3. Whether you had just entered a fresh OTP or were retrying an earlier step.

Do not send your OTP, certificate, or any password/key to anyone by email or
chat -- support does not need them, and the app never displays them either.

## Going live for real (production)

Everything above can be run once in ZATCA's **sandbox** (test) environment
safely, as many times as you need. When you're ready to actually go live:

1. Repeat this exact same wizard, but with your ZATCA **production**
   Fatoora Portal account and a production OTP.
2. Never reuse a sandbox OTP or certificate for production, and never reuse
   a production OTP for testing -- ZATCA treats them as completely separate
   registrations.

## Optional: double-check from a terminal too

You don't need this section to finish setup -- Steps 1-4 above are enough.
But if you (or whoever helps you) want to double-check things from a
terminal as extra proof, here's the short version. This uses the same
external API the developer guide (`zatca-sandbox-test-guide.md`) covers in
full, just the one read-only check that's safe and useful for a beginner:
confirming your onboarding status without clicking through the UI again.

You'll need an API key first (from **Developers** in the app's main
navigation -- not your ZATCA/Fatoora login) and your integration ID (shown
on the ZATCA **Manage** page URL, or ask support).

Open PowerShell and set these once:

```powershell
$BASE_URL = "https://your-domain.com"
$API_KEY = "YOUR_API_KEY"
$INTEGRATION_ID = "YOUR_ZATCA_INTEGRATION_ID"
```

Then check the current status:

```powershell
curl.exe -i `
  -H "Authorization: Bearer $API_KEY" `
  "$BASE_URL/api/external/v1/zatca/status?integrationId=$INTEGRATION_ID"
```

What to look for in the response:

- `onboardingStatus: "production_ready"` -- matches the green **Active -
  Production** badge in the app; you're fully live.
- `onboardingStatus: "compliance_csid_issued"` or `"compliance_verified"` --
  matches the yellow **In Testing (Sandbox)** badge; setup isn't finished
  yet, go back to the wizard.
- HTTP `401` -- your API key is wrong or missing; re-copy it from
  **Developers** (the developer portal, in the main navigation).
- HTTP `403` -- your API key is valid but missing the `read:accounting`
  scope; ask whoever created the key to add it.

If you want to go further than this one check (running the compliance
batch, signing, submitting -- all from the terminal instead of the wizard),
that's exactly what `zatca-sandbox-test-guide.md` walks through step by
step; everything from Test 4 onward in that guide mirrors Steps 2-4 of this
one.

## For the development team (proof of a working setup)

If you're collecting evidence that ZATCA onboarding genuinely works end to
end, gather (from a real sandbox run using your own Fatoora account):

- A screenshot of the Fatoora Portal OTP screen (Step 2).
- A screenshot of the Step 4 status screen showing **Active - Production**
  (after also completing a real production run).
- The **View Logs** list showing at least one invoice marked `accepted`.
- The result of clicking **Test Connection** while on the Active status.

These, together with `zatca-sandbox-test-guide.md`'s API-level checks, cover
the client's delivery checklist. Note that no one but the business owner can
produce the OTP screenshot -- it requires their own live ZATCA login.
