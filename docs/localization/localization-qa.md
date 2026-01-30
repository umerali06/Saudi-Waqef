# Localization QA Report (Draft)

## Scope
- Core dashboards, sales, purchases, HR, and report modules.
- Arabic-first layout with English fallback.

## Checks
- Translation coverage: missing keys log in dev console.
- RTL alignment: labels, inputs, and tables visually verified.
- Date/time formats: `ar-SA` / `en-US` via locale formatters.
- Currency formatting: SAR applied consistently.

## Known Follow-ups
- Review long Arabic labels for truncation on mobile.
- Validate email templates for RTL alignment.
- Check file exports for localized number formatting.
