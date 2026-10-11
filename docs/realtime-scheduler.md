# Realtime statistics scheduler (Vercel Hobby)

Vercel Hobby cron cannot run every five minutes. Instead, GitHub Actions triggers a protected API collector on a best-effort five-minute schedule. Scheduled GitHub Actions run only from the default branch; this workflow is inactive until explicitly released to main.

## Release checklist (only after owner's explicit approval)

1. Generate one long random value locally (for example, Python `secrets.token_urlsafe(48)`). Never commit or paste it in chat.
2. Set Vercel **Production** environment variable `REALTIME_COLLECTOR_SECRET` to this value, as a sensitive/secret value.
3. Set GitHub repository Actions secret `REALTIME_COLLECTOR_SECRET` to exactly the same value.
4. Merge the reviewed development PR into main only after explicit owner authorization. Redeploy Production to load the Vercel environment variable and the API endpoint.
5. Run the `Realtime statistics collection` workflow manually once using Actions > Run workflow; confirm a successful response and new rows in `realtime_statistics_snapshots`.
6. Observe scheduled runs and the last snapshot time. GitHub Actions schedule is best-effort and may be delayed or dropped under load, so do not claim exact five-minute sampling.

The endpoint is `POST /api/internal/realtime-collect` with `Authorization: Bearer <secret>`. It requires no browser session, performs one collector pass, and rejects requests when the secret is unset or wrong. Do not make it public or call it from the browser.

In Production, the in-process background thread is disabled because Vercel serverless functions do not provide persistent process execution. Local development continues to use the background thread.

Note: A five-minute sample cadence can estimate changes between snapshots, but cannot reconstruct exact YouTube minute-by-minute view counts. Existing YouTube Analytics data remains authoritative after its reporting delay.
