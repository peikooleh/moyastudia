# Statistics and YouTube catalog consistency work plan

Branch: `fix/analytics-playlist-thumbnails-audit`

## Guardrails

- Do not merge this branch without explicit approval.
- Do not change unrelated landing, calendar, editor, authentication, or deployment behavior.
- Keep the existing protected scheduler secret name for compatibility in this change.
- Keep manual catalog refresh/reconcile as a fallback.
- Make statistics and catalog state reflect only data that YouTube can support reliably.

## Part 1 — Statistics and scheduled catalog refresh

1. Remove the synthetic realtime statistics feature:
   - remove 60 minute and 48 hour periods from Statistics;
   - remove browser polling for realtime statistics;
   - remove `/channels/{id}/analytics/realtime`;
   - remove `/internal/realtime-collect`;
   - remove local realtime background collection;
   - remove the five-minute realtime GitHub Action;
   - remove `RealtimeStatisticsSnapshot` from the active model;
   - add a forward Alembic migration that drops `realtime_statistics_snapshots`.
2. Preserve ordinary YouTube Analytics periods: 7, 28, 90 days, lifetime.
3. Preserve current public YouTube counters where they are already used as current totals.
4. Preserve and verify the independent 12-hour catalog refresh:
   - `.github/workflows/catalog-refresh.yml`;
   - protected `/internal/catalog-refresh`;
   - incremental refresh for every active connected channel;
   - bounded page-by-page continuation until no channel is pending.
5. Statistics should consume the already cached catalog and should not require a browser page to stay open for scheduled refresh.
6. Keep the existing last successful synchronization timestamp and manual refresh/reconcile fallback.

## Part 2 — Playlist and video thumbnail consistency

1. Playlist thumbnail writes:
   - keep the official `playlistImages.insert/update` write path;
   - verify the custom playlist image resource after the write;
   - do not treat a browser `blob:` preview as proof that YouTube accepted the remote state;
   - reread playlist state after a successful write.
2. Playlist thumbnail reads:
   - continue using playlist `snippet.thumbnails` for display URLs because `playlistImages` does not expose the image URL;
   - make refresh behavior explicit and test the case where the YouTube thumbnail URL changes after a Studio-side edit.
3. Video thumbnails:
   - audit the catalog refresh/reconcile path to ensure mutable video thumbnail URLs are refreshed from YouTube together with other mutable metadata;
   - add regression coverage so a changed YouTube video thumbnail replaces the cached catalog thumbnail.
4. Add focused tests for write verification, reread behavior, scheduled refresh, and thumbnail cache replacement.

## Validation

- API tests, including analytics/catalog/playlist/video regression tests.
- Web tests if present for affected modules.
- Lint.
- Production build.
- Review the branch diff for unrelated changes.
- Keep Statistics and thumbnail work separable in commits where practical.
