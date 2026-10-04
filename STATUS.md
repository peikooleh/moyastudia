# Current Handoff — Studio UI/UX, 2026-10-04

## Accepted / implemented

- **A1 — Videos:** implemented and visually accepted at 1440×900, 1024×768, and 390×844. The selected-video workspace uses the available desktop width, titles and metadata no longer overlap, dates are localized, the mobile video list is bounded with internal scrolling, local Save is secondary, and the future **Save to YouTube** control remains disabled.
- **A2 — Playlists:** implemented. Playlist selection, summary, neutral **Date** label for YouTube `snippet.publishedAt`, localized visibility/date, playlist ID copy/open-on-YouTube, current-page selection, selected count, page sizes 10/30/50/100, pagination, and **Open in Studio** are present. Playlist membership writes are not implemented.
- **A2.1 — Playlists compact bulk UI:** code is present after the interrupted Codex run. The three large bulk buttons were replaced by one **Bulk actions / Массовые действия / Масові дії** select in the same selection toolbar as **Select on this page** and the selected count. The future Add / Move / Remove items are visible but disabled; the permanent help text is shortened and explicitly says removing from a playlist does not delete the YouTube video. Mobile playlist summary and toolbar styles are compact/responsive.
- Dev lifecycle tooling is in place through `dev-start.ps1`, `dev-status.ps1`, and `dev-stop.ps1`. Ownership distinguishes `managed`, `unrelated`, `unverified`, and `none`; Access denied does not imply unrelated. Confirmed managed processes can be safely recovered after approved elevated inspection.

## Validation state

- Before the Codex usage limit interrupted A2.1, the A2 implementation had passed `node --test tests/studio-catalog.test.mjs` (**30/30**), `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- A2 was visually reviewed at 1440×900, 1024×768, and 390×844.
- During A2.1, Codex reported that tests, lint, and production build passed before the run stopped during final browser/runtime recovery.
- **A2.1 final browser QA was not completed after the last code changes.** Treat its responsive/browser state as pending verification rather than accepted.
- Known `favicon.ico` 404 is non-blocking. The previously observed `/channels/{id}/catalog/status` 404 returned HTTP 200 in the completed A2 final browser pass.

## Product boundaries

- YouTube Write Mode remains a placeholder. No playlist membership write, upload, publish, thumbnail write, or other YouTube write request is implemented.
- Backend/API/database/Alembic/OAuth behavior was not changed by A1/A2/A2.1.
- Playlist bulk semantics reserved for future Write Mode: **Add** keeps membership in the current playlist; **Move** is future add-to-target + remove-from-current; **Remove from playlist** removes membership only and must not delete the YouTube video.

## Next UI work

1. Complete a final visual/browser check of A2.1 when a browser-capable local environment is available; only fix regressions caused by A2.1.
2. **A3 — Calendar:** polish the existing calendar without changing read-only data flow; add/verify a clear Today action and ensure `+N` overflow opens a compact day view without forcing excessive page scrolling.
3. Then continue Statistics, Cabinet, Landing/footer/legal, followed by one cross-app responsive/accessibility polish pass.

# Stage 3 Current Handoff - 2026-10-03

This entry supersedes older "current status" and next-step text below. Historical records remain unchanged.

## Completed

- Stage 3 sections 3-14 are implemented. Title/Description/Tags have larger multiline editors, bounded heights, internal scrolling, preserved YouTube counters and validation states, and no automatic truncation. Local `videos.title` is `Text`; `youtube_title` and `working_base_title` remain `String(255)`. Migration `0005_working_title_text` changes only the local working title and protects downgrade if long drafts exist.
- The Inspector keeps supported working fields editable, presents other metadata/statistics read-only, maps known category IDs to names, and omits raw technical JSON/export.
- Playlists has its own Studio workspace. Playlist items use the existing Video Inspector; cached catalog videos have local working state, while uncached videos are read-only snapshots. No YouTube write operation or new playlist persistence model was added.
- Cabinet channel changes require confirmation. Channels is the add/select flow; Connections presents Google account/access state and reauthorization. Snapshot conflict actions appear only for actual conflicts and change local state only.
- The Studio header no longer contains a channel switcher; Cabinet remains the active-channel selection UI. Studio navigation order is Videos → Calendar → Playlists.
- Section 14 source review retained the existing catalog/calendar loading, empty, error, stale/partial, selected, conflict, and unavailable states; playlist loading, empty, error, and uncached states are represented.
- No commit or push was performed.

## Section 15 Responsive verification

- Verified the authenticated app with the real Google OAuth session, real channel/catalog/playlist API data, and no mocks or interception at desktop 1440x900, tablet 768x1024, mobile portrait 390x844, and mobile landscape 844x390.
- Fixed the observed desktop/tablet catalog growth: `.studio` now fits the area below the header and catalog controls; the video list and Inspector have independent vertical scrolling. Mobile portrait retains the list-above-Inspector layout and its bounded list scroll.
- Made same-title channels distinguishable using the already returned YouTube channel ID in Cabinet channel/connection cards, discovery options, and Cabinet switch confirmation. The Studio header channel switcher was subsequently removed; no API request, channel ID, ownership, or persisted data changed.
- Added a localized no-results message for empty search/filter results, distinct from an actually empty channel and an unimported catalog.
- Tablet and mobile-landscape Inspector fields now use the available Inspector width in one column; desktop field layout remains two-column.
- Real stale-state behavior was inspected: catalog status can report `STALE` with `can_continue=true` after a successful sync ages past 15 minutes. With no `last_error_code`, the UI correctly offers Check for new videos / Full reconciliation rather than Continue. No state-machine change was made.
- §15 viewport/layout findings are resolved and verified. A real working conflict/dirty video and over-limit metadata value were not present in the 138-video catalog, so those specific states remain unverified rather than being synthesized.

## Section 16 Browser flow

- Verified the real authenticated flow through Cabinet, Studio/Videos, live catalog search/filter/sort, Playlist workspace, cached playlist video to the shared Inspector, uncached playlist video to read-only Inspector, channel context, and live channel discovery. Discovery was canceled without changing channel data.
- Real catalog: 138 cached videos; 9 playlists on the selected channel. No YouTube write or sync action was triggered.

## Validation

- Backend: **77 passed** in the previously reported full run; not rerun for the responsive fixes.
- Frontend catalog tests: **26 passed** in the targeted run after the channel-label helper change.
- `npm run lint` and `npm run build`: previously passed with existing warnings; not rerun for the responsive fixes.
- Editor diagnostics: no errors in the changed frontend files.
- No full test, lint, build, or repository diff-check run was performed during the responsive-fix pass.

## Remaining

- Section 15 layout verification is complete at the four recorded viewports. Real conflict/dirty state and over-limit warnings remain unverified because no suitable real records were available.
- Section 16 real authenticated browser flow is verified as recorded above.
- Full automated checks were not rerun after responsive fixes; see Validation. No commit or push has been performed.

## Migration

- Revision `0005_working_title_text` follows `0004_video_working_readiness`; it changes only `videos.title`. Downgrade refuses to narrow a stored local title longer than 255 characters.

# MoyaStudia — Current Status

## Stage 2.5 — Current Status

**Stage 2 / 2.5 scope: implemented and locally verified.** Account/Auth/Connections and the original prompt's supported information architecture, data hierarchy, search, channel metrics, sync status, Calendar and responsive requirements have been checked in the browser. Playlist data remains channel-wide/read-only as supported; the UI does not claim per-video playlist membership or add a new YouTube operation.

### Architecture

```text
User
	├── UserSession
	└── GoogleConnection
				└── Channel (0..N)
```

Implemented model remains `User → GoogleConnection → Channel`. `Channel.google_connection_id` and global `youtube_channel_id` uniqueness are unchanged; no Channel transfer or `user_id` was added. Authentication, sessions, connections, Channel ownership and available Channels are server-authoritative. Theme/UI language remain browser-global; onboarding/selected-channel/channel-language preferences carry an `accountUserId` marker and reset when a different MoyaStudia user signs in. Server-returned Channels are validated against that preference before selection.

### Application states

- `ANONYMOUS`: `/auth/session` returns `authenticated: false`.
- `SESSION_LOADING` / `SESSION_ERROR`: frontend request state, distinct from anonymous.
- `AUTHENTICATED_NO_CONNECTION`: valid User session, zero GoogleConnections.
- `AUTHENTICATED_WITH_CONNECTIONS`: one or more owned GoogleConnections, whether or not they have saved Channels.
- `AUTHENTICATED_CONNECTION_NO_CHANNEL`: a connection exists but no local Channel is attached.
- `CHANNEL_SELECTION`: an owned connection is selected; current discovery and save endpoints perform discovery/selection.
- `AUTHENTICATED_CHANNEL_SELECTED`: selected Channel exists in the current user's owned Channel set.
- `LOGOUT_IDLE`, `LOGOUT_PENDING`, `LOGOUT_ERROR`: UI request states; logout success is confirmed by an OK response or by `/auth/session` proving the backend session is already anonymous.
- OAuth callback results are typed, allowlisted UI states; raw exception text/secrets are not returned in redirect parameters.

User authentication, YouTube connection and selected Channel are independent. `youtube_connected` must not be interpreted as `has_channel`.

### API contracts

Implemented owner-scoped `GET /google-connections`, requiring an authenticated User. It returns only that user's GoogleConnections and local Channel associations, makes no YouTube calls, and omits `google_subject`, refresh tokens and encrypted values. Response shape:

```json
[
	{
		"id": 12,
		"email": "account@example.test",
		"status": "connected",
		"channel_count": 1,
		"channels": [
			{ "id": 34, "youtube_channel_id": "UC…", "title": "Channel", "thumbnail_url": "" }
		]
	}
]
```

`status` is `connected` only when `is_active` and a non-empty stored encrypted refresh token are present; otherwise it is `reauthorization_required`. This is a stored-state indicator, not a live Google refresh-token validity probe. `channel_count` and nested `channels` describe local Channel records, not every YouTube channel available to the connection. Empty `channels` is valid.

Preserved `GET /google-connections/{id}/available-channels` and `POST /google-connections/{id}/channels`; both remain owner-scoped and revalidate connection/channel ownership. Cabinet uses a connection ID internally to discover/select Channels without another OAuth round trip. Explicit reauthorization stores the targeted connection ID in the existing one-time OAuth state's purpose; callback validates session, browser binding, owner and verified Google subject before updating the connection. No DB migration was needed.

`GET /channels` now also returns `catalog_video_count`, the count of locally cached videos with YouTube IDs; it is not presented as the live YouTube total. The existing read-only `/channels/{id}/refresh-profile` response supplies YouTube `video_count` and `hidden_subscribers` when a profile refresh is available. Catalog list search/sort use effective title/description, and every row returns `dirty`/`dirtyFields` from its working values.

### OAuth, errors and logout policy

- Keep Identity OAuth separate from YouTube OAuth. Identity never requests YouTube consent.
- Keep YouTube `access_type=offline`, current scopes and encrypted refresh-token storage.
- For a user's first YouTube connection or explicit reauthorization, request consent. For adding an account when the user already has an active connection with a stored refresh token, request account selection without unconditionally forcing consent.
- If Google does not issue a refresh token and no usable token is already stored, redirect with the typed `consent_required` result and offer an explicit retry using consent. A valid stored refresh token is retained when OAuth omits a new one.
- Explicit reauthorization is owner-scoped and OAuth-state-bound. A callback with a different verified Google subject returns a typed mismatch and does not change ownership or create a replacement connection.
- OAuth callbacks redirect to the app with a fixed allowlisted status (cancelled, invalid state, ownership conflict, consent required or generic provider failure); no raw exception details, codes, tokens or secrets in UI URLs.
- Logout remains same-origin. It safely retries/clears an expired cookie, deletes a matching server session when present and clears the cookie in the response. Frontend shows pending/error and returns to Landing only after confirmed logout or confirmed anonymous session state.

### Preferences policy

Keep theme and UI language browser-global. Add a minimal authenticated-user owner marker for `onboarded`, `selectedChannelId` and `channelLangs`; on a different MoyaStudia user, clear those account-scoped values while retaining theme/language. On logout, do not treat local storage as authentication. Always validate a stored Channel ID against the current user's server-returned Channels before selecting it. No backend preferences subsystem or DB migration is planned.

### Scope boundary

No Channel ownership/model change, automatic transfer, YouTube write scope/operation, disconnect/destructive cleanup, catalog/snapshot redesign, or Stage 3 work. Full GoogleConnection disconnect remains out of scope; preserving its refresh token is required.

### Completed

- Added owner-scoped `GET /google-connections` with status, local channel count/list and no credentials; preserved existing discovery/selection endpoints and ownership invariants.
- Kept Moya Identity login separate from YouTube OAuth. First/no-stored-token and explicit reauthorization use consent; ordinary additional account connection does not unconditionally force consent. Offline access/scopes/encrypted refresh-token storage remain.
- Added state/browser/user-bound per-connection reauthorization and a verified-subject mismatch recovery path; a newly required refresh token can be retried with explicit consent, while an existing stored token is retained if Google omits a replacement.
- OAuth cancellation, invalid state, provider/token configuration failure, connection failure, cross-user conflict, consent-required and session expiry redirect with allowlisted query statuses; frontend shows localized recovery messages.
- Authenticated users can continue from onboarding to Cabinet and separately connect YouTube. Cabinet reads real Connections, groups Channels by connection ID, discovers Channels for an existing connection and offers explicit reauthorization.
- Logout now has idle/pending/error/retry UI and a bounded request. The same-origin backend logout is idempotent for absent/expired sessions and clears the cookie; after failure/timeout the client checks `/auth/session` and redirects if the backend already revoked the session.
- Global Shell shows the selected channel's localized catalog sync state from the existing read-only endpoint, including loading, unavailable and no-channel states; no sync/write operation was added.
- Catalog API search/sort now use effective title/description and effective title cursors. Each row returns dirty fields, and Studio shows local-change state for every edited row.
- `/channels` returns a local catalog video count without schema changes. Cabinet channel rows show subscribers and distinguish live YouTube video count (from the existing profile refresh) from cached catalog count; hidden subscriber counts are labeled as hidden.
- Video list shows availability separately and keeps duration out of repeated rows. Calendar uses local date keys so scheduled items render on the correct day. Inspector playlist metadata no longer shows an empty selected-video field; supported channel playlists are a clearly labeled secondary read-only disclosure.
- Account-specific browser prefs reset across Moya user changes, while theme/UI language remain global. Selected Channel/channel-language entries are reconciled against the current user's Channels.
- No schema migration, Channel ownership change, disconnect, dependency update, YouTube write, commit or push.

### Prompt progress

- [x] Read instructions, status, prompt, current code and pre-change Git state; preserve dirty prompt and launcher files.
- [x] Record entity/state model and concrete API response before functional code.
- [x] Implement authenticated owner-scoped GoogleConnection listing; empty connections and multiple Connections/Channels covered.
- [x] Keep existing channel discovery/selection flow usable without another OAuth round trip.
- [x] Implement conditional consent and explicit owner-bound reauthorization without changing scopes, offline access or token encryption.
- [x] Add typed OAuth recovery, logout pending/error/retry, channel-less Cabinet path, account-scoped prefs and stale-channel validation.
- [x] Preserve global Channel uniqueness/ownership and add regression tests; no DB/schema changes.
- [x] Search and title sorting use effective local values; cursor pagination follows effective-title order.
- [x] Every catalog row exposes and displays its own working dirty state.
- [x] Channel responses distinguish local catalog count from live YouTube video count; subscriber and video metrics render compactly in Cabinet.
- [x] Availability is explicit in video rows; duration remains in the selected-video Inspector only.
- [x] Supported read-only channel playlists remain secondary and are labeled as channel-wide; no unsupported selected-video membership claim or extra YouTube call was introduced.
- [x] Browser-verified authenticated Studio, Cabinet, Connections, channel-less onboarding, discovery of an existing connection, channel selection, Calendar and logout recovery using synthetic records in an isolated temporary SQLite database; no live Google/YouTube calls.
- [x] Responsive screenshots/checks at 390/768/1024/1440; repaired mobile shell overlap and confirmed scheduled Calendar items render on their local date. Video list rows show availability separately and keep duration in the Inspector.
- [x] Added global shell sync status using the existing read-only catalog endpoint; verified selected-channel and no-channel labels in the browser.
- [x] Updated this handoff and ran the listed checks; no commit or push.

### Validation

- `apps/api`: `python -m pytest -o addopts= -q -c apps/api/pytest.ini apps/api/tests` — 74 passed in this run; 3 existing Starlette/FastAPI deprecation warnings.
- `apps/web`: `node --test apps/web/tests/studio-catalog.test.mjs` — 20 passed in this run; existing Node module-type warning for `prefs.js`.
- `npm run lint --prefix apps/web` — passed in this run; existing `<img>`, custom-font and deprecated `next lint` warnings remain.
- `npm run build --prefix apps/web` — passed in this run; same non-blocking image/font warnings.
- Editor diagnostics — no errors in modified app/backend/test files.
- `git diff --check` — passed; only Git LF/CRLF normalization warnings.
- Local verification used Next.js at `http://localhost:3000` and FastAPI at `http://127.0.0.1:8000` concurrently. FastAPI used a temporary isolated SQLite DB with synthetic users/sessions/channels/video; `/health` returned `db:true`, `google_configured:false`. Both servers were responsive after the production build; the dev server was restarted afterward.
- Browser logout: successful `POST /auth/logout` returned 200, the immediate UI became Landing, and `/auth/session` returned `authenticated:false`; Cabinet redirected to Landing. Double-click sent exactly one POST. An aborted POST while the session remained active showed the retry error; retry returned 200 and logged out. Lost-response reconciliation was also exercised.
- Browser login recovery: after logout the login link reached the local API. With Google credentials deliberately absent, the real endpoint returned typed `provider_unavailable`; a synthetic redirect/session fixture then restored authenticated Studio state without contacting Google.
- Browser layouts were inspected with screenshots and overflow checks at 390/768/1024/1440. Studio, Videos, Calendar, Inspector, Cabinet, Connections, channel selection, playlist disclosure, empty states, auth/channel errors and all seven catalog sync states were exercised with isolated synthetic data.
- Tests use SQLite fixtures/mocks; no live OAuth, production session, PostgreSQL migration or YouTube API/write operation was run.

### Known limitations

- `status=connected` means active plus non-empty encrypted refresh token, not that Google has recently validated it. Detecting revocation requires a separate safe refresh/probe policy and is not required by the original Stage 2 prompt.
- No GoogleConnection disconnect/revoke endpoint was added; this was explicitly excluded to avoid destructive token/connection lifecycle decisions.
- Logout pending, double-click protection, active-session error/retry, successful server logout, lost-response reconciliation and logged-out Cabinet navigation were checked in the browser. Actual Google identity OAuth was not run: the isolated API deliberately had no Google credentials and returned the typed `provider_unavailable` result; a synthetic local redirect/session fixture verified authenticated state restoration.
- There is no persistent automated React end-to-end suite; interactive auth/onboarding, Connections, channel selection, logout, Calendar, Inspector and responsive states were manually exercised in the browser during this run.
- Live refresh-token validity still cannot be inferred from stored encrypted-token presence; no live Google probe was made.
- Playlist information is channel-wide, read-only and shown in a secondary Inspector disclosure. The selected-video membership field was removed rather than left blank or inferred; the original prompt requires supported playlist information but prohibits adding a new YouTube operation for membership lookup.

### Next step

Stage 2/2.5 is complete within the original prompt's read-only product scope and has been locally verified. Live Google token validation and real Google OAuth were not performed because no Google credentials were used in the isolated environment; these are external validation boundaries, not unimplemented prompt UI/API requirements. Do not add disconnect or change Channel ownership as incidental follow-up.

### Git state

- Branch: `main`; HEAD before implementation: `587e1012c92f77f5a2f4b7af2f8c3efe935b2942`.
- Existing user changes remain uncommitted. This pass additionally changed `apps/api/app/main.py`, `apps/api/tests/test_catalog.py`, `apps/web/app/logout-control.js`, `apps/web/lib/auth-state.mjs`, `apps/web/app/page.js`, `apps/web/app/globals.css`, `apps/web/app/shell.js`, `apps/web/app/studio.js`, `apps/web/app/cabinet/page.js`, `apps/web/lib/i18n.js`, `apps/web/tests/studio-catalog.test.mjs` and this status handoff.
- `промпт.txt` and the four untracked launcher scripts were preserved and not edited. No commit or push was created.
- No commit was created.

---

## Stage 2 History — 2026-10-02

The Stage 2 implementation and audit snapshot below is historical; Stage 2.5 status above supersedes it. Product architecture and roadmap remain in [MoyaStudia_ARCHITECTURE.md](MoyaStudia_ARCHITECTURE.md).

### Current Stage

Stage 2 — Information Architecture + UI System is implemented in the frontend. Its goal was to organize the existing shell, workspace navigation, Videos/Inspector, Calendar, Playlists, Cabinet and responsive presentation without adding product capabilities or changing backend contracts.

Stage 2 is at UI/code handoff, not a fully evidenced viewport-by-viewport visual sign-off. The separate Stage 2.5 Account/Auth/Connections implementation is recorded above.

### Completed

- Global shell now has brand, active channel selector, Videos/Calendar navigation, Cabinet and logout. The selector shows avatar/name and changes the browser-local selected channel.
- Videos has search/filter/sort, compact thumbnail/title/status/date/duration rows, catalog status/actions, and a selected-video Inspector.
- Inspector keeps effective values and existing local edit/save/reset/conflict behavior. Metadata, statistics, playlists and snapshot/working/revision details are lower-level disclosures.
- Calendar uses cached scheduled/published catalog items, month navigation, search/filter and the shared Inspector. It does not create draft events.
- Playlist workspace and unsupported Create/upload controls were removed. Read-only channel playlists are shown in the Inspector.
- Cabinet has Account, Connections, Channels and Interface tabs; quota/AI mock panels and oversized channel presentation were removed.
- Frontend distinguishes session/channel loading and errors from anonymous/empty states. Backend/API/DB/OAuth were not modified.
- Two runtime fixes were subsequently made in `apps/web/app/page.js`: import the existing `t` function and guard the initial nullable channel state before inspecting index 0.
- Existing snapshot/working/effective, revision and conflict flows remain in use. No dependency changes or commit were made.

### Prompt Progress — `промпт.txt`

Status key: `[x]` complete; `[~]` partial; `[ ]` not complete; `[!]` requires a separate decision.

#### Scope and audit

- [x] Phase A inventory: routes, shell, Studio, Cabinet, CSS, API data shapes and responsive rules were inspected before implementation.
- [x] Phase B IA plan: affected files and intended responsibilities were identified before implementation.
- [x] Stage 2 stayed in the existing frontend architecture; no new feature, dependency, API, model, DB schema or auth system was added.
- [x] Git baseline and pre-existing user changes were recorded; no commit was made.

#### App shell and navigation

- [~] Global shell: brand, channel avatar/name selector, Videos/Calendar navigation and Cabinet/account actions exist. Catalog/sync status is shown inside Videos, not in the global shell.
- [x] Workspace primary navigation is Videos and Calendar; Playlists is not a primary workspace route.
- [x] Cabinet is a separate route and the active channel can be changed from the shell.

#### Videos and data hierarchy

- [~] Compact video list shows thumbnail, effective/local title, status, date and duration. Duration is currently present in every row despite the prompt asking not to repeat it in every row.
- [~] Local-change indicator is shown for the selected video only; the catalog list API has no per-row dirty field for all entries.
- [~] P0 title/status/date and human-readable catalog state are surfaced. Availability is not presented as a separate field; it is folded into the status label. Sync status is in the Videos view, not the global shell.
- [~] P1 thumbnail/duration are adjacent to the video; subscriber count is hidden in Channel details, and video count is not available in the current `/channels` response.
- [~] P2 description/tags remain visible as editing fields; other metadata/statistics are disclosures. Playlists in the Inspector are channel-wide playlist rows, not verified membership for the selected video.
- [x] P3 YouTube ID, revision, catalog freshness and snapshot/working/base/conflict payloads are in Technical details; they are not in ordinary list rows.
- [x] Existing effective/snapshot/working and conflict/revision behavior was retained; no backend working-state contract was changed.
- [!] Search still queries snapshot `youtube_title`/`youtube_description`, while the list displays effective/local title. `промпт.txt` explicitly defers backend changes; decide separately whether API search should include effective values.
- [x] Existing visibility filters and sort options were reused; no new filter family was added.

#### Calendar and Playlists

- [~] Calendar shows catalog events with month navigation, compact existing filters/search and selected-video Inspector; loading/error/catalog states are represented in code. Visual verification at each requested viewport remains unconfirmed.
- [x] Calendar only renders catalog items with scheduled/published dates; no draft-event model or UI was added.
- [~] Full Playlist workspace and unsupported disabled actions were removed. Read-only playlist data remains in Inspector, but the API returns no selected-video-to-playlist membership, so this is not per-video membership information.

#### Cabinet, placeholders and onboarding

- [~] Cabinet has Account, Connections, Channels and Interface sections; channel selection/details are more compact and secondary details are disclosed.
- [~] Connections is currently derived/grouped from `/channels` rows. A GoogleConnection that has no saved Channel is therefore not represented as a connection entry.
- [x] Quota and AI-provider mock panels and unsupported disabled playlist/write controls were removed from the primary UI.
- [~] Catalog states are mapped to localized user-facing labels. Loading/session/channel errors are distinct in the frontend, but authenticated no-channel onboarding still makes Cabinet/exit paths unclear.

#### Responsive, visual validation and boundaries

- [~] Responsive CSS includes shell/list/Inspector/Calendar/Cabinet rules at 900, 720 and 390 CSS-pixel breakpoints. The user reported manual visual review; exact checks at 390/768/1024/1440 and screenshot/overflow evidence are not recorded.
- [~] Existing CSS variables and patterns were extended rather than replaced. Full visual consistency is not independently verified by browser screenshots.
- [~] No production YouTube write was performed and no backend/auth/DB/OAuth/sync algorithm/pagination/snapshot-working/conflict/revision implementation was changed. Real authorized read-only data was not independently verified during this pass.
- [x] Phase E code validation completed as recorded below; no dependencies or lockfiles were changed.
- [x] Stage 2 completion summary was reported. Search mismatch and other backend requirements remain documented rather than implemented.

### Runtime Fixes Already Made

Both changes are limited to `apps/web/app/page.js`:

1. Added the missing `import { t } from "../lib/i18n"` used by loading/error messages.
2. Changed the first-channel guard to `channels?.[0]` so the effect is safe while `channels` is initially `null`; behavior for loaded non-empty arrays is unchanged.

After these fixes, `npm run lint --prefix apps/web` and `npm run build --prefix apps/web` passed. `git diff --check` passed (Git emitted only LF/CRLF normalization warnings). The restarted local dev server returned HTTP 200 for `/`. The catalog test suite had last passed 14/14 before these two page-only runtime fixes; it was not rerun specifically afterward.

### Known Issues / Remaining Work

- Logout POST removes the MoyaStudia server session and cookie only on success. The UI redirects only for `response.ok`; failed/non-2xx requests have no visible error/fallback. Google provider SSO and browser-local preferences are not cleared by app logout.
- YouTube OAuth always requests `prompt=consent` with `access_type=offline`, so reconnecting can repeatedly show Google's consent screen. Identity login is a separate flow and uses `prompt=select_account`.
- MoyaStudia Identity login, YouTube GoogleConnection and selected YouTube Channel are distinct states. Backend permits an authenticated user without any connection/channel, but the root route gates Studio on onboarding/channel presence.
- Cabinet route itself is available to an authenticated channel-less user, but onboarding does not always provide a clear link there or a logout action. A `youtube_connected` user may reach Cabinet without the `select_connection` context needed to discover channels.
- Cabinet's Connections list is inferred from channels; a connection with zero saved channels is invisible. There is no owner-scoped API endpoint to list GoogleConnections independently.
- A YouTube channel is owned through exactly one GoogleConnection. Cross-connection selection of an existing global `youtube_channel_id` is rejected with HTTP 409; ownership is not transferred.
- Browser `moyastudia.prefs.v1` persists `onboarded`, selected channel and channel-language preferences across logout and is not user-scoped.
- API search does not match effective/local titles; selected-video local change state is not available for every list row; per-video playlist membership and channel `video_count` are absent from current API data.
- Browser bridge screenshots/DOM verification did not complete. The user separately reported manual visual review; no exact viewport matrix is recorded here.

### Validation

- `npm run lint --prefix apps/web` — passed after runtime fixes; existing `<img>`, custom-font and deprecated `next lint` warnings remain.
- `npm run build --prefix apps/web` — passed after runtime fixes; same non-blocking warnings.
- `node --test apps/web/tests/studio-catalog.test.mjs` — 14 passed on the final Stage 2 UI state, before the two later `page.js` runtime fixes; not rerun after them.
- `git diff --check` — passed; only line-ending normalization warnings.
- `GET http://localhost:3001/` via local PowerShell — HTTP 200 after dev-server restart. This confirms HTTP response/Next compilation, not an interactive browser-console pass.
- Browser visual validation — user reported a manual review; embedded browser bridge did not confirm rendered DOM/screenshots or the required viewport matrix.
- Backend tests were not run in the Stage 2/runtime-fix handoff. No production YouTube mutations or OAuth run were performed.

### Git State

- Branch: `main`.
- HEAD: `587e1012c92f77f5a2f4b7af2f8c3efe935b2942`.
- Before this STATUS update, tracked worktree changes were seven frontend files plus the already-dirty `промпт.txt`; four launcher files were untracked. No commit exists for these worktree changes.
- Stage 2 frontend files currently modified: `apps/web/app/cabinet/page.js`, `apps/web/app/globals.css`, `apps/web/app/onboarding.js`, `apps/web/app/page.js`, `apps/web/app/shell.js`, `apps/web/app/studio.js`, `apps/web/lib/i18n.js`.
- Existing user-owned files: `промпт.txt`, `create-desktop-shortcut.ps1`, `start-moyastudia.bat`, `start-moyastudia.ps1`, `stop-moyastudia.ps1`. Do not modify or overwrite them.
- This handoff update modifies `STATUS.md` only. No commit is to be created.

### Continuation Point

Stage 2 UI is implemented; first decide whether to close its remaining visual/data-priority gaps or start a separately scoped Account/Auth/Connections follow-up. Recommended next task: agree the auth/onboarding state model and whether authenticated users without a YouTube Channel should have an explicit Cabinet/Workspace path. Do not alter OAuth consent, ownership, or connection lifecycle as incidental Stage 2 cleanup.

---

Historical handoff snapshot: 2026-10-01. The following sections are retained as project history and are superseded by the current handoff above.

## Project purpose

MoyaStudia is a SaaS workspace for managing YouTube channels and content. YouTube remains the source of truth for published state and media files. The product stores local working title/description/tags for catalog videos; it does not write content to YouTube or store video files.

## Current stage

Google Identity and YouTube OAuth connection flows work end-to-end. Identity scopes are normalized to `openid`, `userinfo.email`, and `userinfo.profile`; Google ID-token verification allows one second of clock skew. YouTube OAuth requests the minimal read-only set `youtube.readonly`, `openid`, and `userinfo.email`, without merging previously granted scopes. A local Fernet `TOKEN_ENCRYPTION_KEY` is configured and used to encrypt YouTube refresh tokens. Channels connect successfully and their details appear in Cabinet.

The Stage 2A/2B discovery and selection flow, Stage 3 read-only catalog pipeline, and Stage 4 local working state/readiness are implemented and tested. The product remains read-only with respect to YouTube; no YouTube write-back is implemented. Temporary OAuth diagnostics in `apps/api/app/main.py` intentionally remain for the next real-flow verification and must be removed in a separate step afterward.

## Current git baseline

Current branch: `main`. This handoff records the completed Google Identity and YouTube OAuth connection flow, alongside the existing catalog and Stage 4 work. Local untracked launcher scripts are outside this change.

## Actual architecture

- `apps/web`: Next.js 15.5.27 App Router, React 19.3.0. `app/` contains landing, onboarding, Cabinet, Studio and shared UI; `lib/` contains API/preferences/localization/catalog helpers.
- `apps/api`: FastAPI, SQLAlchemy and Google OAuth/YouTube client. `app/main.py` owns routes and authorization; `app/youtube.py` owns Google/YouTube API calls; `security.py` owns sessions/OAuth state; `tokens.py` encrypts refresh tokens.
- `apps/api/migrations/versions`: Alembic revisions `0001_foundation`, `0002_video_catalog`, `0003_video_working_state`, and `0004_video_working_readiness`. Revision `0003` is covered by SQLite migration tests; PostgreSQL deployment has not been verified.
- Tests: `apps/api/tests`; `apps/web/tests/studio-catalog.test.mjs`.
- CI: `.github/workflows/ci.yml` runs backend pytest and frontend catalog tests, lint and build on pull requests.

Identity is Google-only in the running product. A MoyaStudia user has server-side sessions and may own Google connections; a Google connection may expose multiple YouTube channels. OAuth state is one-time, expiry-checked and browser-bound. The session cookie is HttpOnly; only its hash is stored in the database. YouTube refresh tokens are Fernet-encrypted at rest. Protected channel operations check session ownership server-side.

Channel discovery does not persist unselected channels. Cabinet submits explicitly selected channel IDs; the API rechecks that they are available through the owned connection. The schema permits provider values beyond Google, but Apple OAuth is not implemented.

`Video` is the only catalog table, with unique `(channel_id, youtube_video_id)`. YouTube metadata is stored in `youtube_*` snapshot columns, separate from MoyaStudia working fields. YouTube is the external source of truth; local DB cache is the Studio catalog source after import. Catalog fetching resolves the selected YouTube channel's uploads playlist, processes at most 50 video IDs per page, and keeps YouTube page tokens on the backend.

Initial import, incremental sync and full reconcile are page-based and resumed through browser requests; there is no Celery, Redis or background worker. Reconcile deletes absent cached videos only after the complete successful scan. Partial/failed reconcile preserves cache. IDs without returned video details are marked unavailable, not deleted. The video list endpoint is DB-only. Studio does not trigger initial import on open; LOADING recovery continues through the existing endpoint, with server-side lease/concurrency protection authoritative.

## Current user flows

`Landing → Google identity OAuth → server session → onboarding → YouTube connection OAuth → Cabinet channel discovery/selection → Studio`.

For catalog use: `NOT_IMPORTED → explicit initial sync → LOADING/PARTIAL → COMPLETE or EMPTY`; reopening Studio reads status/cache without automatically starting a live sync. Users can continue resumable sync, run incremental refresh, or request full reconcile. UI preferences (language/theme/selected channel) are browser-local, not authentication state.

## Catalog states

| State | Meaning |
|---|---|
| `NOT_IMPORTED` | No sync record exists; cache may contain zero rows. Initial import is user-started. |
| `LOADING` | A sync mode has started and can be continued. A page lease may be active; the server may return 409. |
| `PARTIAL` | At least one page was saved and another page token remains. |
| `COMPLETE` | Initial import/reconcile completed, or incremental sync reached its stopping point. |
| `EMPTY` | A successful scan found no video IDs. |
| `STALE` | Successful cache is older than 15 minutes, or a sync error occurred while cache exists. |
| `ERROR` | Sync failed and there is no cached video data. |

Status derives `can_continue` for `LOADING`, `PARTIAL`, `STALE` and `ERROR`; without a sync row it is false. Error states with existing videos are presented as `STALE`.

## Catalog API

All protected routes require a valid MoyaStudia session and channel ownership. `GET /channels/{id}/videos` and `GET /channels/{id}/catalog/status` permit reading cache for an inactive connection. Sync routes require an active connection and same-origin request.

| Method and path | Purpose / contract |
|---|---|
| `GET /channels/{id}/videos` | DB-only pages. Query: `limit` 1–50, DB `cursor`, `q`, `visibility`, `sort`, `date_from`, `date_to`. Returns `items`, `next_cursor`, `total`, `status_counts`, and `summary`. No YouTube page token is exposed. |
| `GET /channels/{id}/catalog/status` | Returns state, mode, cache/scanned counts, last success/error and `can_continue`. |
| `POST /channels/{id}/catalog/sync` | JSON `{ "mode": "initial" | "incremental" | "reconcile" }`; starts or resumes the selected mode and returns status. May return 409 for lease/mode conflicts. |
| `POST /channels/{id}/catalog/sync/continue` | Fetches and saves at most one YouTube page (maximum 50 IDs), then returns updated status. 409 means the sync is not continuable or a page lease is held; YouTube failures return 502. |

Other implemented connection routes include `GET /google-connections/{connection_id}/available-channels` and `POST /google-connections/{connection_id}/channels`. `DELETE /channels/{id}` exists but currently returns 409; it does not disconnect a channel.

## What is implemented

- Google Identity login/logout, server-side sessions and browser-bound OAuth state. Identity scopes use `openid`, `userinfo.email`, and `userinfo.profile`; ID-token verification allows one second of clock skew.
- YouTube OAuth connection using `youtube.readonly`, `openid`, and `userinfo.email`, without `include_granted_scopes=true`; selected channels are saved and displayed in Cabinet.
- Encrypted Google/YouTube refresh-token storage and owner-scoped API access.
- Google connection reuse, paginated channel discovery and explicit channel selection.
- Read-only video cache, catalog status, DB pagination/filtering, initial/incremental/reconcile sync and LOADING resume.
- Stage 4 local working state/readiness: local title/description/tags overrides and base snapshots, revision-checked owner-scoped detail/PATCH API, Studio local editing/save/reset/status UI, and reconcile retention for locally modified videos missing remotely.
- Studio catalog/calendar cache views, onboarding, Cabinet settings and en/ru/uk UI localization.
- Alembic-managed schema and PR CI for backend/frontend checks.

## What is not implemented

- Apple OAuth/login; channel disconnect/revoke/reconnect retention and automatic data cleanup.
- YouTube write operations: video upload/edit/publish/schedule, metadata/branding mutation or playlist mutation.
- Playlist membership synchronization/cache; the playlist API currently returns only playlist ID/title.
- Draft lifecycle/TTL, readiness rules, templates, media storage, comments, analytics, billing, teams/roles remain unimplemented. Studio UI integration-test coverage is limited to catalog helper tests; no React component integration test exists.
- Background workers, continuous polling, and permanent video/media-file storage.

## Known technical issues

- `DELETE /channels/{id}` is a placeholder that returns 409; the planned connection lifecycle is unfinished.
- Playlist listing is channel-scoped in the current worktree and returns only ID/title; it is not a playlist membership cache. Studio fields beyond those returned may be empty.
- `0001_foundation` drops pre-existing prototype `channels` and `videos` tables without migrating their data. Use a fresh/verified database and backup before applying migrations to any existing database.
- `next lint` is deprecated for Next.js 16; current lint/build report existing `<img>` and custom-font warnings. Backend tests report FastAPI/Starlette deprecation warnings.
- Production Google OAuth, real YouTube quota behavior, and migration deployment against the configured production PostgreSQL database have not been verified.
- The frontend catalog suite exercises helper behavior, not the rendered Studio editing workflow end-to-end.

## Tests / verification

Backend handoff verification on 2026-10-01:

- Targeted auth: `apps/api/.venv/Scripts/python.exe -m pytest tests\test_auth.py -q` from `apps/api` — **22 passed**, 3 Starlette/FastAPI deprecation warnings.
- Full backend: `apps/api/.venv/Scripts/python.exe -m pytest -q` from `apps/api` — **50 passed**, 3 Starlette/FastAPI deprecation warnings.
- Frontend catalog: `node --test tests/studio-catalog.test.mjs` from `apps/web` — **9 passed** (previously verified).
- `npm run lint` from `apps/web` — passed in the prior UI pass; existing `<img>` and custom-font warnings remain, and `next lint` reports deprecation.
- `npm run build` from `apps/web` — passed in the prior UI pass with the same existing frontend warnings.
- `git diff --check` — passed; Git reports only LF/CRLF normalization warnings for modified files.

The migration upgrade/downgrade tests use SQLite fixtures; no PostgreSQL production migration was run. Frontend tests cover helpers, not React UI integration. Automated backend tests mock OAuth and do not call Google/YouTube; local Google Identity and YouTube channel connection flows were separately confirmed end-to-end. Production OAuth and live YouTube quota behavior remain unverified.

## Current limitations

The application is read-only with respect to YouTube. Full Cabinet/Studio flows require a reachable PostgreSQL database, Google OAuth configuration and an authorized test user. Without OAuth, only anonymous frontend/health checks are available. The documented database target is PostgreSQL/Neon; the actual local `DATABASE_URL` was not inspected as it is secret configuration.

## Next development steps

1. Remove the temporary OAuth diagnostic code from `apps/api/app/main.py` after the successful real OAuth verification.
2. Add “Remove channel from MoyaStudia” without deleting the YouTube channel or its content; define and verify cleanup of local connection, channel, and cache data, then test reconnection.
3. Continue the interface work from the prompt: the Title / Description / Tags metadata limits are implemented; remaining UI work is still pending.
4. Separately complete retrieval of full playlist data and membership.

## Handoff instructions

- Read `AGENTS.md` first, then this file for implementation status. Treat `MoyaStudia_ARCHITECTURE.md` as product baseline/target architecture, not a completion checklist.
- Inspect `git status`, the owning code and nearby tests before work. Never add the temporary `промпт.txt` file.
- Do not read or print `.env`, `.env.local`, OAuth secrets, tokens or database credentials. Use `.env.example` for variable names.
- Run Alembic only against a known safe database; the foundation migration removes legacy prototype tables.
- Keep changes incremental. Do not add YouTube write scopes/operations, dependencies, workers or architectural layers without explicit task scope. Do not commit/push unless asked.

## Historical status notes (superseded by the handoff above)

The following older entries are retained only as project history. Do not use their stage, environment, test-count or implementation claims as current facts.

Дата среза: 2026-09-30. Обкатка на каналах MoyaMova (несколько брендов DE/UK/EN на одном Google).

## Patch 01 — фундамент read-only

Сделано первым проходом:
- убрана опасная подмена канала при `fetch_channel(channel_id)`: если конкретный ID не найден, больше не выбирается первый канал аккаунта;
- refresh credentials оставлен без повторной передачи списка scopes, чтобы не ломать обновление access token;
- чтение видео расширено с жёсткого лимита 150 до параметризованного read-only лимита до 500;
- API получил явный `limit` для каталога видео;
- схлопнут накопившийся блок CSS `channels layout v2`: единый источник правил для плиток, выбранного канала и карточки;
- красные тестовые акценты в выбранном состоянии заменены на системный `--accent`;
- локальные `.env` и API virtualenv дополнительно исключены из Git;
- README/STATUS приведены к новой цели: MoyaStudia без генерации, реальные YouTube-данные, сначала read-only, затем write.

Проверка: Python API проходит `compileall`. Production build Next.js в текущем изолированном окружении не завершён, потому что Next 14 попытался скачать отсутствующий native SWC из npm registry, а сетевой доступ в среде проверки недоступен. Это ограничение среды, а не диагностированная ошибка приложения.

## Фаза

Stage 1 Foundation реализован: Google identity MoyaStudia, серверные HttpOnly sessions, browser-bound OAuth state, шифрование refresh tokens, ownership-scoped API, Alembic schema, tests и GitHub Actions CI. Apple предусмотрен identity-моделью, OAuth пока не включён.

Прототипные строки `channels` / `videos` считаются тестовыми и удаляются начальной миграцией без переноса. Подключение Google/YouTube сохраняет connection, но поиск и выбор каналов, импорт каталога и синхронизация остаются Stage 2/3. До их реализации read-only studio workflow недоступен. Запись в YouTube не включена.

## Готово

### Инфраструктура
- Репозиторий `apps/api` + `apps/web`.
- PostgreSQL schema Stage 1 управляется Alembic; API не изменяет схему при старте.
- Identity providers: Google работает, Apple допускается базовой моделью без OAuth-потока.
- OAuth redirect URIs: `/auth/google/callback` для входа и `/auth/youtube/callback` для отдельного YouTube connection.
- Session cookie хранит непрозрачный token; в БД только hash и срок действия. Refresh token connection хранится в Fernet-encrypted виде.
- Каналы и видео принадлежат Google connection; каждый API endpoint проверяет session и owner.
- Тестовый пользователь в OAuth consent — иначе 403 `access_denied`.

### Кабинет
- Лендинг, вход через Google identity, выход с отзывом серверной session.
- Онбординг языка интерфейса и темы.
- Шестерёнка ведёт в кабинет, на страницах кабинета скрыта.
- Профиль: email Google identity, кольца квоты (муляж Recharts); OAuth client secrets не запрашиваются у браузера.
- Заглушки ключей ИИ (OpenAI / Anthropic / Gemini).
- Интерфейс: радио языка и темы. Заглушка «главная страница студии».
- Компоненты каналов/студии сохранены, но до Stage 2 подключённые каналы не обнаруживаются и прототипные данные не отображаются.

### Студия
- Вкладки Каталог / Плейлисты / Сетка (календарь слотов).
- Список роликов выбранного канала с YouTube, фильтры, поиск, сортировка.
- Карточка полей и превью — чтение.
- Шапка студии: лого, баннер, счётчики статусов, ближайший слот / последняя публикация (плейлист в подсказке пока пустой).

### Темы
- CSS-переменные light/dark/auto. Шрифты Manrope + Fraunces с Google Fonts.

## Исторические заметки Patch 01 (проверить при возвращении к Stage 2/3)

- Если вместо `youtube.py` положить `main.py`, API отдаёт `module youtube has no attribute list_videos` и 502 на видео.
- Refresh токена со списком SCOPES в `Credentials(...)` даёт 502 на `/videos` и `/refresh-profile`. Нужен refresh только token + client id/secret.
- `GET /channels` не должен вызывать YouTube в цикле и ссылаться на переменную `info` после цикла.
- Старый CSS плиток (`width: 200px`, `opacity: 0.72`) перебивал новые правила — в `globals.css` много дублей, конец файла содержит блок «channels layout v2». Имеет смысл схлопнуть при следующем проходе по стилям.
- Подписчики = 0, если на канале скрыт счётчик (`hiddenSubscriberCount`).
- Описание канала пустое, если его нет в YouTube — это не баг API.
- Список видео режется ~150 id (лимит обхода uploads).
- Плейлист у ролика в карточке студии всегда пустой: нет стыковки `playlistItems` всех полок.
- Баннер YouTube — широкая картинка; в шапке студии кроп 2560×423.

## Новый порядок разработки

Цель проекта: SaaS для управления YouTube-контентом без необходимости постоянно пользоваться YouTube Studio. Видео остаются на YouTube; MoyaStudia не становится видеохранилищем.

Следующие этапы после Foundation:

1. Stage 2: несколько Google accounts, discovery/selection каналов, connect/disconnect/reconnect и retention.
2. Stage 3: video catalog, progressive import, cache, sync, удалённые ролики.
3. После read-only этапов и утверждения UI переходить к write-функциональности.

Генерация видео в MoyaStudia не входит в продуктовую архитектуру.

## Файлы, которые нельзя путать

- `apps/api/app/youtube.py` — Google client, `fetch_channel`, `list_videos`, `list_playlists`.
- `apps/api/app/main.py` — FastAPI маршруты и ownership checks.
- `apps/api/app/security.py` — OAuth state и session cookie.
- `apps/api/app/tokens.py` — шифрование refresh tokens.
- `apps/api/migrations/` — Alembic schema history.
- `apps/web/app/cabinet/page.js` — кабинет.
- `apps/web/app/studio.js` — студия.
- `apps/web/app/globals.css` — темы и вёрстка.
- `apps/web/app/providers.js` + `lib/prefs.js` — localStorage.

## Окружение разработки автора

Windows, PowerShell. Git: `C:\Program Files\Git\cmd\git.exe`.
API venv: `D:\GITHUB\moyastudia\apps\api\.venv` (Python 3.12).
Web: `D:\GITHUB\moyastudia\apps\web`, Next.js 15.5.27.
Не использовать корневой `.venv` репозитория и не запускать `npm` из `apps\`.

## Запись 2026-09-30 — frontend security/dependency upgrade

Выполнено сегодня:
- Next.js обновлён `14.2.15` → `15.5.27`.
- React и React DOM обновлены `18.3.1` → `19.3.0`; Recharts `2.15.1` сохранил заявленную peer-совместимость с React 19.
- `eslint-config-next` и связанный `@next/eslint-plugin-next` обновлены `14.2.15` → `15.5.27`.
- Уязвимый Next-transitive PostCSS `8.4.31` заменён override на `8.5.28`.
- Уязвимый `glob@10.3.10` удалён вместе с прежним lint plugin; новый plugin использует `fast-glob@3.3.1`. В дереве остаётся `glob@7.2.3` через ESLint cache, но он не попадает в диапазон затронутого glob advisory.
- Исходный код, UI, маршруты и бизнес-логика не менялись; compatibility fixes в приложении не потребовались.

Security:
- Исправлены найденные audit advisories Next.js, включая Windows-hosted RCE и AVIF Image Optimization RCE; также закрыты текущие advisories PostCSS и glob.
- Итоговый `npm audit`: 0 vulnerabilities, включая 0 HIGH и 0 CRITICAL.
- Остались только npm deprecation notices (включая старые ESLint/Recharts ветки) и существующие lint/build warnings по `<img>` и Google Fonts; они не являются HIGH/CRITICAL audit findings.

Проверки:
- `npm ci` — успешно, clean lockfile install; 0 vulnerabilities.
- `npm audit` — успешно; 0 vulnerabilities.
- `npm ls next react react-dom postcss glob eslint-config-next @next/eslint-plugin-next --all` — дерево проверено; Next `15.5.27`, React/React DOM `19.3.0`, PostCSS `8.5.28`, plugin/config `15.5.27`, уязвимый glob 10.x отсутствует.
- `npm run lint` — успешно; остались указанные выше warnings и сообщение о deprecated `next lint`.
- `npm run build` — production build успешно завершён на Next 15.5.27.
- Backend pytest — 11 passed; frontend automated test script в `apps/web/package.json` отсутствует.
- Browser smoke на локальном production build с mock API проверил anonymous landing, login/OAuth links, session-gated onboarding, YouTube-connected onboarding state, cabinet profile/channels, Studio catalog/video detail, playlist view, calendar/grid и logout/navigation. Реальные Google OAuth и YouTube API вызовы не выполнялись; callback/session security дополнительно проверена существующими backend tests.
- `git diff --check` — без whitespace errors.

Файлы, изменённые dependency upgrade:
- `apps/web/package.json`
- `apps/web/package-lock.json`

Текущее состояние: Stage 1 Foundation сохранён; frontend работает на Next 15.5.27 + React 19.3.0, dependency audit чистый. Функциональность проекта не менялась. Другие уже существовавшие изменения worktree не затрагивались. Commit/push не выполнялись.

Продолжить завтра: Stage 2 — спроектировать и реализовать discovery/selection YouTube-каналов после отдельного согласования конкретного объёма; начать с тестов на выбор только явно отмеченных каналов и ownership Google connection.

## Запись 2026-10-01 — Stage 2A/2B и Stage 3 read-only catalog

Эта запись актуализирует состояние проекта; более ранние пункты «Следующие этапы» и «Продолжить завтра» выше являются историческими.

### Stage 2A/2B — discovery и выбор каналов
- YouTube OAuth callback сохраняет/переиспользует `GoogleConnection` и направляет пользователя в Cabinet для выбора.
- Добавлены ownership-scoped discovery и selection endpoints. Discovery использует paginated `channels.list(mine=True)` и не создаёт Channel rows.
- Только явно выбранные каналы записываются в `Channel`; сохранение повторно проверяет доступность IDs через указанный GoogleConnection.
- Сохранена глобальная уникальность `youtube_channel_id`. Повторное подключение не дублирует connection/channel; channel, уже принадлежащий другому GoogleConnection, даёт предсказуемый conflict.
- Schema identity/connection/channel не менялась; video catalog и retention lifecycle не входят в Stage 2A/2B.

### Stage 3 — read-only YouTube catalog
- `Video` остаётся единственной таблицей видео. Существующий unique key `(channel_id, youtube_video_id)` сохранён.
- YouTube snapshot отделён от будущего MoyaStudia working state: metadata записывается в `youtube_*`; `title`, `description`, `tags`, `internal_status` не используются как импортный snapshot.
- Добавлена Alembic revision `0002_video_catalog`: snapshot metadata, `availability_status`, `last_synced_at`, `last_seen_generation`, индексы и `channel_catalog_syncs` на Channel с page cursor, generation, progress/error state и expiring lease.
- Migration upgrade сохраняет существующие Video rows. Downgrade обрабатывает nullable `internal_status`. Миграция протестирована на SQLite fixture; её применение к dev/production database здесь не подтверждалось.
- YouTube fetch теперь channel-specific: сначала определяется uploads playlist выбранного YouTube channel ID, затем читается одна страница максимум до 50 IDs и загружаются детали этой страницы. `mine=True` + первый channel для каталога не используется.
- `GET /channels/{id}/videos` читает только БД; поддерживает DB cursor pagination, server-side search/visibility/sort/date filters и cache summaries. YouTube page token остаётся на backend.
- Добавлены `GET /channels/{id}/catalog/status`, `POST /channels/{id}/catalog/sync` (`initial`, `incremental`, `reconcile`) и `POST /channels/{id}/catalog/sync/continue` (не более одной YouTube page за запрос).
- Initial import запускается только явной кнопкой Studio «Загрузить каталог». Страницы сохраняются независимо, cursor позволяет продолжить импорт; новые cache rows доступны Studio до окончания полного каталога.
- Incremental refresh ограничен поиском новых uploads до известного video ID. Full reconcile использует generation и удаляет отсутствующие Video только после успешного прохождения всех страниц. Ошибки API/quota сохраняют cache и помечают его stale/error.
- Если uploads playlist содержит ID, но YouTube не возвращает полноценные video details, Video сохраняется как `unavailable`; удалённым он автоматически не считается.
- Studio использует server-paged cache, показывает import/sync states и summary, не запускает initial import при открытии. Playlists запрашиваются только при открытии их вкладки; playlist synchronization не реализована.
- Поздние ответы предыдущего selected Channel игнорируются. Локальный импорт content-plan, который мог заменить каталог в памяти, удалён; YouTube write/upload/edit не добавлены.

### Проверки
- `apps/api`: pytest — 34 passed. Покрыты selected-channel API fetch, 0/1/50/>50, pagination/resume, upsert/repeat sync, initial/incremental/reconcile, partial failure, successful deletion, unavailable IDs, quota mapping, lease/concurrency, ownership/inactive connection, DB filtering/pagination, migration upgrade/downgrade.
- `apps/web`: `node --test tests/studio-catalog.test.mjs` — 2 passed для DB-only URL и stale-response guard.
- `npm run build` — успешно на Next.js 15.5.27; остались существующие warnings по `<img>` и custom fonts.
- Browser smoke с mock API подтвердил явный старт initial import, отображение cache, отсутствие playlist-запроса при открытии Catalog и запрос playlists только при выборе соответствующей вкладки. Реальные OAuth и YouTube API вызовы не выполнялись.
- `git diff --check` — whitespace errors отсутствуют; были только предупреждения Git о LF/CRLF для уже изменённых файлов.

### Текущее состояние и ограничения
- Stage 1 Foundation, Stage 2A/2B и Stage 3 read-only catalog реализованы в коде.
- Перед использованием catalog API на установленной БД нужно применить Alembic upgrade до `head`; автоматическое изменение schema при старте API не включено.
- Импорт выполняется последовательными запросами браузера к API; Celery/Redis/background worker не добавлялись.
- Полная playlist synchronization/membership, YouTube write operations, upload/edit, media storage и disconnect/reconnect retention остаются за рамками.
- Изменения Stage 3 внесены поверх уже имевшихся локальных изменений worktree. Commit/push не выполнялись.

## Запись 2026-10-01 — UI polish, localization, responsive pass

Выполнен косметический проход по существующим экранам без перестройки приложения и без изменений backend/API/model/sync flow.

### Изменения интерфейса

- Landing: убраны фиктивные live-счётчики; добавлены продуктовый workspace preview и заметное сообщение о read-only подключении.
- Onboarding: яснее оформлены этапы и подсказки; индикатор шагов доступен для screen reader; read-only notice объясняет, что подключение не изменяет YouTube.
- Cabinet: добавлены оформленное пустое состояние и localized channel details/tooltips; AI-provider placeholders и studio-layout placeholder явно показывают, что функции пока недоступны; интерфейсные настройки сведены к реальным языку и теме.
- Studio: весь пользовательский текст, статусы каталога, фильтры, поля видео, playlists и calendar переведены через общий словарь en/ru/uk. Добавлены подсказки для действий, фильтров, поиска, сортировки, экспорта и календарной навигации.
- Общие стили: согласованы light/dark tokens, контрастные состояния, hover/focus-visible, размеры поверхностей, desktop/mobile раскладки и reduced-motion поведение. На mobile ширине 390 px проверено отсутствие горизонтального overflow.
- `document.lang` синхронизируется с выбранным UI-языком; metadata больше не содержит русскоязычное описание для всех языков.
- Google OAuth, YouTube API, catalog sync, ownership и database code не менялись. YouTube write/upload UI не включался; все существующие write controls остаются disabled.

### UI проверки

- Backend pytest: 34 passed.
- Frontend Node tests: 2 passed.
- `npm run build`: успешно. Остались warnings по `<img>` и подключению Google Fonts.
- `npm audit`: 0 vulnerabilities.
- `pip-audit` не выполнен: модуль отсутствует в API virtualenv. Зависимости не устанавливались и не менялись.
- Целевой ESLint: 0 errors; только существующие `<img>` и custom-font warnings. Editor diagnostics: ошибок нет.
- Browser smoke с mock API проверил Landing, onboarding, Cabinet, Studio, украинский/английский текст и responsive ширину 390 px. Реальные API/OAuth/YouTube вызовы не выполнялись.
- Проверка translation keys: все статически используемые `t(uiLang, "...")` ключи присутствуют в en/ru/uk словарях.

### Состояние и ограничения

- Изменены только frontend presentation/localization файлы и этот STATUS.md; API/backend/migrations не затронуты.
- Реальная проверка Google OAuth и YouTube недоступна без подключения реального API; интерфейсный smoke использовал mock responses.
- Python dependency vulnerability audit требует отдельно добавить/запустить `pip-audit`; пакет не устанавливался в рамках косметического задания.
- Изменения оставлены незакоммиченными; commit/push не выполнялись.

## Stage 4 — First increment complete

- Status: implementation and requested validation are complete in the current Stage 4 completion commit, whose parent is `646dcf8` (`Add local video working-state backend`). The current commit hash is available from `git log`.
- Data contract: `Video.title`, `description`, and `tags` are local overrides; `NULL` inherits the current YouTube snapshot and `""` is an explicit empty value. Per-field `working_base_*` and `working_revision` support conflict detection and stale-write protection.
- Migration: Alembic `0003_video_working_state` follows `0002_video_catalog`, adds nullable overrides/base values/revision, and backfills existing local values. Upgrade/downgrade is tested using SQLite fixtures only; PostgreSQL production migration is not verified.
- API: owner-scoped `GET /channels/{channel_id}/videos/{video_id}` returns snapshot, working, effective, base, dirty/conflict state and revision. Owner-scoped, same-origin `PATCH /channels/{channel_id}/videos/{video_id}/working` accepts only revision/title/description/tags; stale revisions return `409` with current state. Snapshot fields cannot be patched.
- UI: Studio edits title, description and tags; shows the YouTube snapshot and local working state; supports Save locally and reset to snapshot; displays Modified/Saved/Conflict and remote-missing states. This does not write to YouTube.
- Reconcile: after a complete successful scan, locally modified missing videos are retained and marked `remote_missing`; clean missing rows are deleted. Partial/failed scans do not delete cached rows.
- Validation on 2026-10-01: backend pytest **44 passed** (3 deprecation warnings); frontend catalog tests **9 passed**; `npm run lint` passed with existing `<img>`/custom-font warnings and deprecated `next lint`; `npm run build` passed with the same warnings; `git diff --check` passed.
- Limitations: migration has not been tested/applied against PostgreSQL; frontend tests cover helpers rather than rendered React UI integration; YouTube write-back is not implemented.
- Files in the Stage 4 completion commit: `STATUS.md`, `apps/api/app/main.py`, `apps/api/tests/test_catalog.py`, `apps/web/app/globals.css`, `apps/web/app/studio.js`, `apps/web/lib/catalog-state.mjs`, `apps/web/lib/i18n.js`, `apps/web/tests/studio-catalog.test.mjs`. The only remaining modified file is the pre-existing tracked `промпт.txt`; it is intentionally excluded.
- Next task: validate `0003_video_working_state` upgrade on a disposable PostgreSQL database; afterward, validate the subsequent `0004_video_working_readiness` upgrade on the same disposable database. Do not run either check against production.
## Запись 2026-10-03 — YouTube metadata limits in Studio

### Title / Description / Tags

- [x] Studio editor теперь показывает лимиты YouTube для локальных working-полей `title`, `description` и `tags`.
- [x] Title считается в Unicode characters; лимит — 100 символов.
- [x] Description считается в UTF-8 bytes через `TextEncoder`; лимит — 5000 bytes.
- [x] Tags считаются с учётом разделителей и дополнительных символов для тегов, содержащих пробелы; лимит — 500.
- [x] Для Title и Description отображается отдельное предупреждение при наличии `<` или `>`, поскольку такие символы не допускаются YouTube в соответствующих metadata fields.
- [x] UI показывает обычное состояние, предупреждение при приближении к лимиту и ошибку при превышении.
- [x] Введённые данные не обрезаются автоматически.
- [x] Превышение YouTube-лимита не запрещает сохранение локального MoyaStudia draft; UI явно сообщает, что такой draft остаётся локальным.
- [x] Backend-контракт working state не изменялся.
- [x] Добавлены unit-тесты для Unicode/UTF-8 byte accounting, граничных значений Title/Description/Tags и правил подсчёта тегов.
- [x] Изменения ограничены frontend Studio, catalog helper, localization и соответствующими тестами.

### Validation

- `node --test tests\studio-catalog.test.mjs` — **22 passed, 0 failed**.
- `npm run lint` — **passed**; остались существующие `<img>`/custom-font warnings и deprecated `next lint` warning.
- `npm run build` — **passed**; production build успешно завершён.
- `git diff --check` — требуется/выполнено отдельно перед commit.
- Browser smoke: локальный Next.js dev server успешно запустился; полноценный authenticated Studio flow в этой сессии не выполнялся через изолированный API/session environment.
- Commit/push не выполнялись.
