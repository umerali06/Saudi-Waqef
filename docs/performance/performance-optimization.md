# Performance Optimization Notes

## Server-Side Caching
- Cached reference datasets (chart of accounts, tax categories, payment terms).
- Cached company config and defaults with short TTL.
- Invalidate caches on create/update operations.

## Frontend Guidance
- Prefer batched API calls for settings pages.
- Avoid refetch loops by tracking dependencies carefully.
- Use pagination for large datasets where applicable.

## Firestore Best Practices
- Add composite indexes for large filtered queries as needed.
- Keep payloads small and avoid large document reads.
- Consider exporting analytics to a warehouse for heavy BI usage.

## Monitoring
- Track API response times and log slow endpoints.
- Review cache hit rates monthly.
