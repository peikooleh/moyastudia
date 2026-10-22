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


## Implementation status — 2026-10-22

Implemented in this branch:

- synthetic 60m/48h Statistics UI and API removed;
- realtime snapshot model, collector module, endpoint, workflow, translations and obsolete tests removed;
- forward migration `0016_drop_realtime_statistics` added;
- 12-hour catalog refresh workflow and protected endpoint preserved unchanged;
- scheduled catalog refresh tests preserved;
- playlist thumbnail writes now require post-write custom-image verification;
- playlist thumbnail endpoint rereads the remote playlist state after a verified write;
- frontend no longer promotes a local `blob:` URL to remote truth after upload;
- incremental catalog regression coverage now asserts replacement of an existing video's cached thumbnail URL;
- scheduler and thumbnail behavior documented;
- display URLs now receive cache-busting versions so a YouTube thumbnail replacement is visible even when YouTube reuses the same CDN URL; canonical YouTube URLs remain unchanged in storage.

Validation:

- API pytest: passed in CI.
- API dependency audit: passed in CI.
- Web catalog tests: passed in CI.
- i18n parity: passed in CI.
- Web lint: passed in CI (existing `<img>` warnings only).
- Web dependency audit currently blocks the final build because repository baseline Next.js 15.5.27 received a new critical advisory; the security release is 15.5.28. That dependency upgrade is intentionally not mixed into this focused branch without a regenerated lockfile and its own validation.
- No merge performed.

## Final validation

Validated on the isolated branch after implementation:

- API pytest suite passes;
- Python dependency audit passes;
- Studio web tests pass;
- i18n parity check passes;
- Next.js lint passes (existing non-blocking warnings remain);
- production dependency audit passes after updating Next.js from 15.5.27 to the security-fixed 15.5.28 patch release;
- deployment build passes on Next.js 15.5.28.

The Next.js update is intentionally limited to the runtime `next` package and lockfile entries required by that patch. React and unrelated dependencies were not changed. No merge is performed as part of this work; the branch remains the manual verification point before owner approval.

## Follow-up findings — 2026-10-22

Playlist image contract was rechecked against the current official YouTube Data API documentation after manual testing:

- `playlistImages.list` uses the documented `playlistId=<playlistId>` filter;
- `playlists.snippet.thumbnails` is the documented source of playlist thumbnail URLs used for rendering;
- the current `playlists.contentDetails` resource documents `itemCount` and does not expose a `thumbnailVideoId` field, so MoyaStudia must not infer custom-thumbnail state from that absent property;
- the frontend again renders the URLs returned by YouTube and keeps cache-busting on display URLs so unchanged CDN URLs do not leave stale browser images.

Dependency audit follow-up:

- production `npm audit --omit=dev` passes;
- full local `npm audit` reports GHSA-vfj7-8cjw-p6xm through the ESLint-only chain `eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`;
- as of 2026-10-22 the advisory has no published patched `braces` release, so `npm audit fix --force` would only perform an unrelated breaking downgrade and is not an accepted remediation;
- do not hide this advisory with an unreviewed override. Replace the lint toolchain in a separate infrastructure change only after proving equivalent Next.js, React and accessibility coverage, or update normally when upstream publishes a patched dependency path.
