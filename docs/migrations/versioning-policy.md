# Versioning & Deprecation Policy

## Versioning rules
- Application versions follow `major.minor.patch`.
- Schema changes requiring data transforms must ship with a migration.
- Any breaking API change must bump the major version.

## Migration naming
- Use ISO date prefix: `YYYY-MM-DD-short-description`.
- Each migration must be idempotent and safe to re-run.
- Include a clear description and expected side effects.

## Backward compatibility
- Maintain read-compatibility for at least one minor version.
- Use feature flags for high-risk changes.
- Add fallback reads for legacy fields where possible.

## Deprecation workflow
1) Mark fields/endpoints as deprecated in the release notes.
2) Maintain support for at least one minor version.
3) Add migration to backfill/transform legacy data.
4) Remove deprecated behavior in a subsequent major release.

## Testing requirements
- Run migrations on staging with production-like data.
- Validate critical reports (P&L, balance sheet, VAT).
- Re-run automated QA smoke tests after migration.
