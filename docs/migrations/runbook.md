# Data Migration Runbook

## Purpose
Provide a safe, repeatable procedure to run migrations in production.

## Preconditions
- Confirm the target migration exists in the admin panel.
- Ensure `APP_ENCRYPTION_KEY` is configured in the runtime environment.
- Verify a recent Firestore export/backup is available.
- Schedule a maintenance window if the migration updates large datasets.

## Dry-run checklist
1) Open Admin → Migrations.
2) Run the migration in **Dry run** mode.
3) Review scan/update counts and log output.
4) Confirm no unexpected collections or fields are flagged.

## Execution steps
1) Announce the maintenance window (if applicable).
2) Ensure no conflicting bulk imports are running.
3) Run the migration in **Run migration** mode.
4) Monitor the run history log for errors.
5) Validate sampled records in Firestore.

## Post-migration validation
- Confirm affected fields are encrypted or transformed correctly.
- Review audit logs for a `admin.migration.run` entry.
- Run smoke tests on related UI flows.

## Rollback guidance
- If a migration fails, the registry status is set to **failed**.
- Use the Firestore export to restore the affected collections if needed.
- Document the incident and create a corrective migration for re-run.

## Notes
- Always run a dry-run in production before a real execution.
- Avoid running multiple migrations in parallel.
