# Database Schema Reference

Generated on: 2026-03-03T08:39:37.896Z

## Datastore
- Primary datastore: Google Firestore (document collections).

## Complete Collection List
- Full machine-readable list: `docs/developer/database-collections.csv`
- Detailed collection-by-collection Markdown: `docs/developer/database-schema-detailed.md`
- Total collections discovered: **93**

## Relationships (Inferred)
- Full relationship list: `docs/developer/database-relationships.csv`
- Query/index pattern list: `docs/developer/database-query-patterns.csv`
- Relationships are inferred from `*Id` fields in primary record types and should be validated by the development team before external use.

## Primary and Foreign Keys
- Primary key pattern: Firestore document ID (commonly represented as `id` in record types).
- Foreign key pattern: fields ending with `Id` (for example: `companyId`, `customerId`, `invoiceId`, `employeeId`).

## Field Names and Data Types
- For each collection, `database-collections.csv` includes:
  - `primaryType` (selected primary TypeScript record type from source file)
  - `fields` (field:type pairs extracted from that type)
- Source of truth for field definitions: `src/lib/data/*.ts`.

## Constraints and Indexing
- Business and payload constraints are enforced mainly through:
  - Zod validators in `src/lib/validators/*.ts`
  - Route-level checks and guard functions
- Firestore indexing details are not explicitly versioned in this repository as a dedicated index specification file.
- Index requirements should be validated in deployment configuration for production workloads.

## Security and Access Notes
- Multi-tenant segregation is primarily enforced via `companyId` scoping and authorization guards.
- Sensitive operations are audited via `audit_logs`.
