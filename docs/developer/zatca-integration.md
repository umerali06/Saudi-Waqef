# ZATCA Integration Guide

## Purpose
Provide VAT and e-invoicing data aligned with ZATCA requirements.

## Data mapping
- Company VAT number → `companies.vatNumber`
- Invoice totals → `sales_invoices.totals`
- Line items → `sales_invoices.lines`

## Output formats
- VAT report export: CSV, PDF, JSON (ZATCA draft mapping)
- Use `/api/vat/report/export` for compliant exports.

## Validation
- Ensure VAT periods are filed before export.
- Validate VAT rates by tax category.
