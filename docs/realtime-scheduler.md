# Scheduled YouTube catalog refresh (Vercel Hobby)

MoyaStudia Production runs on Vercel Hobby, so persistent in-process background workers are not used in Production. GitHub Actions calls the protected catalog-refresh endpoint instead.

The synthetic realtime statistics collector was removed because current public counters cannot reconstruct reliable 60-minute or 48-hour YouTube Analytics.

The protected scheduler secret is intentionally still named `REALTIME_COLLECTOR_SECRET` for deployment compatibility. It remains in use by the independent catalog refresh endpoint and workflow; renaming it should be a separate configuration migration.

## Current scheduled refresh

- GitHub Actions workflow: `.github/workflows/catalog-refresh.yml`.
- Schedule: every 12 hours at minute 17 (currently 00:17 and 12:17 UTC, best-effort).
- Endpoint: `POST /api/internal/catalog-refresh`.
- Authentication: `Authorization: Bearer <REALTIME_COLLECTOR_SECRET>`.
- The endpoint advances each active connected channel through one bounded catalog page per call.
- The workflow repeats bounded calls until no channel reports pending work.
- Incremental catalog sync walks the complete uploads catalog so mutable YouTube state, including video metadata, visibility, scheduling, counters, and thumbnail URLs, can converge without the browser being open.
- The existing catalog synchronization timestamp remains the user-facing indication of freshness.
- Manual catalog refresh/reconcile remains available as a fallback when the user believes cached data is stale.

The first Production manual validation completed three connected channels successfully in three rounds with `pending: 0` and no channel errors.

## Production configuration

Required secret:

- Vercel Production: `REALTIME_COLLECTOR_SECRET`
- GitHub repository Actions: `REALTIME_COLLECTOR_SECRET`

Both values must be identical. Never commit the value or print it in logs.

Scheduled workflows run from the default branch, so scheduler changes are not considered released until explicitly merged into `main`.

## Release checklist

1. Keep the existing Vercel Production `REALTIME_COLLECTOR_SECRET`.
2. Keep the matching GitHub Actions repository secret.
3. After explicit owner approval and merge to the default branch, run `Scheduled YouTube catalog refresh` manually once.
4. Confirm the workflow reaches `pending: 0` with no channel errors and the catalog synchronization timestamp advances.
5. Confirm a video thumbnail changed directly in YouTube is replaced in the cached catalog after a scheduled or manual incremental refresh.
6. Confirm API/web CI and the Production deployment are healthy.

The removed five-minute realtime workflow and `/api/internal/realtime-collect` endpoint must not be restored unless YouTube exposes an authoritative source suitable for those time windows.
