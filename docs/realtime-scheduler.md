# Background synchronization and realtime statistics

MoyaStudia Production runs on Vercel Hobby, so persistent in-process background workers are not used in Production. GitHub Actions calls protected internal API endpoints instead. Local development keeps the in-process realtime collector.

## Realtime statistics

The workflow `Realtime statistics collection` calls `POST /api/internal/realtime-collect` on a best-effort five-minute schedule.

Authentication uses `Authorization: Bearer <REALTIME_COLLECTOR_SECRET>`. The same secret is configured in Vercel Production and GitHub Actions. The endpoint requires no browser session and must never be exposed from frontend code.

Each successful collector pass stores a regular counter snapshot when the previous sample is at least about four minutes old, even when the YouTube view count did not change. This produces a usable time series such as `38680 → 38680 → 38687 → 38692`. Realtime views for a window are derived from differences between adjacent stored counters.

Opening the Statistics page is not required for collection. The page reads the accumulated snapshots and may also obtain the current YouTube counter. A 60-minute window needs roughly one hour of accumulated history before coverage is complete. GitHub Actions scheduling is best-effort, so individual samples may be delayed or skipped.

These counters are operational estimates from current YouTube Data API values. They do not replace delayed YouTube Analytics data and cannot reconstruct exact minute-by-minute YouTube history.

## YouTube catalog refresh

The workflow `Scheduled YouTube catalog refresh` calls `POST /api/internal/catalog-refresh` every 12 hours (currently at 00:17 and 12:17 UTC, best-effort).

Each request advances every active connected channel by one bounded catalog page. The workflow repeats requests until every channel reports complete or the bounded round limit is reached. This mirrors the browser refresh loop without requiring MoyaStudia to remain open.

The first Production manual validation completed three connected channels successfully in three rounds with `pending: 0` and no channel errors.

The scheduled catalog refresh updates cached YouTube content metadata. The manual refresh/full-reconcile controls remain available for on-demand or diagnostic synchronization.

## Production configuration

Required secret:

- Vercel Production: `REALTIME_COLLECTOR_SECRET`
- GitHub repository Actions: `REALTIME_COLLECTOR_SECRET`

Both values must be identical. Never commit the value or print it in logs.

In Production, the FastAPI realtime background thread is disabled because Vercel serverless execution is not persistent. GitHub Actions owns scheduled execution. In local development the background realtime collector runs approximately every five minutes.

## Validation

After scheduler-related changes, verify:

1. API and web CI are green on `main`.
2. Vercel Production deployment is healthy.
3. A manual `Realtime statistics collection` run succeeds.
4. A manual `Scheduled YouTube catalog refresh` run reaches `pending: 0` with no errors.
5. Realtime snapshots accumulate over time even across intervals with no view-count change.

Scheduled workflows run from the default branch, so changes to scheduler behavior are not considered released until explicitly merged into `main`.
