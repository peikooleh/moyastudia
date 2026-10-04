# MoyaStudia — Write Mode & Integrations Design

Status: **approved design baseline; not implemented**  
Date: 2026-10-04  
Applies after the merged UI baseline in `main`.

This document defines the next implementation phase. It intentionally does **not** enable YouTube writes, AI calls, uploads, or secret entry by itself.

## 1. Goals

The next phase turns the current read-only/local-working UI into controlled server-backed functionality without weakening the existing ownership/OAuth model.

Priorities:

1. make YouTube mutations explicit, reviewable and recoverable;
2. account for MoyaStudia's own YouTube API usage;
3. keep credentials and provider secrets server-side;
4. preserve local working drafts until a remote write is confirmed;
5. make connection lifecycle explicit instead of hiding stale state;
6. keep bulk operations resumable after partial failure/quota exhaustion.

## 2. Non-goals for the first write milestone

- no arbitrary automation that publishes without a user action;
- no background mass mutation;
- no permanent storage of source video files;
- no browser storage of Google refresh tokens or AI API keys;
- no claim that MoyaStudia can report Google's exact project-wide remaining quota;
- no AI auto-apply: suggestions remain drafts until the user accepts them;
- no large refactor and write rollout in one PR.

## 3. Write Mode safety model

Write Mode is a **server-authoritative capability**, not a cosmetic frontend toggle.

Recommended state:

- default OFF;
- scoped to the authenticated MoyaStudia user;
- optionally narrowed per channel later;
- persisted server-side, never trusted from `localStorage`;
- UI may cache/display the state, but every mutation endpoint re-checks it;
- switching ON requires an explicit confirmation explaining that MoyaStudia may modify YouTube;
- logout/session expiry does not grant any new capability;
- disconnected/reauthorization-required Google connections force effective Write Mode OFF for their channels.

Every mutation request must pass, in order:

1. authenticated session;
2. same-origin/CSRF protection used by existing mutations;
3. resource ownership;
4. active Google connection and decryptable refresh token;
5. Write Mode enabled;
6. operation-specific validation/readiness;
7. quota/bucket preflight;
8. idempotency/concurrency guard where applicable.

The frontend disabled button is never the security boundary.

## 4. First mutation: video metadata

Start with the smallest useful write: update title/description/tags of one existing YouTube video.

Flow:

1. user edits the existing local working copy;
2. local save remains available while Write Mode is OFF;
3. `Send to YouTube` becomes available only when Write Mode is ON and the draft is valid;
4. backend loads the owned Channel/Video and current working revision;
5. backend refreshes/validates the remote snapshot when needed;
6. conflict -> stop and return a typed conflict response;
7. backend records the planned quota charge and performs `videos.update`;
8. on success, update YouTube snapshot fields, working base and sync timestamp in one DB transaction;
9. on remote failure, keep the local draft intact and return an actionable typed error.

Do not clear a draft merely because the request was sent. Clear/advance it only after confirmed YouTube success.

The request should include the expected local working revision. Repeating the same UI action must not accidentally create a second logical mutation.

### Later video mutations

Add separately after metadata is stable:

- visibility/status;
- scheduling;
- thumbnail upload;
- made-for-kids/audience where API-supported and validated;
- category/language where supported.

Publishing/scheduling deserve their own confirmation UX and must not be hidden inside a generic metadata save.

## 5. Playlist writes

Implement after single-video metadata.

Server operations:

- create/update/delete playlist;
- add/remove/reorder playlist item.

Bulk add may orchestrate many single YouTube calls. The backend must return per-item results and stop cleanly when quota is exhausted. Do not roll back already successful YouTube mutations.

Playlist ownership must be verified against the selected channel before mutation.

## 6. Quota accounting

### What MoyaStudia can know

MoyaStudia can accurately record **requests it sends** and calculate usage according to the configured YouTube quota rules.

It cannot claim an authoritative Google-project remaining balance because:

- another application/process may use the same Cloud project;
- Google is the authority for quota accounting;
- costs/buckets can change.

Therefore UI wording should be:

- `MoyaStudia usage today`;
- `Configured project limit`;
- `Estimated remaining for MoyaStudia`;

and never simply `Google quota remaining` unless that value later comes from an authoritative Google source.

### Current official baseline (verified 2026-10-04)

Treat this as configuration/reference data with a `verified_at` date, not immutable business logic.

- ordinary list/read methods: generally 1 unit;
- most create/update/delete methods: generally 50 units;
- `videos.update`: 50 units;
- `thumbnails.set`: approximately 50 units;
- `playlistItems.insert/update/delete`: 50 units;
- `playlists.insert/update/delete`: 50 units;
- `search.list`: separate default bucket of 100 calls/day, 1 unit/call;
- `videos.insert`: separate default bucket of 100 calls/day, 1 unit/call;
- combined default allocation for other endpoints: 10,000 units/day;
- daily quota reset: midnight Pacific Time.

Before implementing or changing cost constants, re-check Google's official quota calculator.

### Ledger

Add a server-side quota ledger. Suggested fields:

- id;
- user_id;
- google_connection_id nullable;
- channel_id nullable;
- operation, e.g. `videos.list`, `videos.update`;
- bucket: `general`, `search`, `video_upload`;
- units;
- request_count;
- outcome: `success`, `youtube_error`, `network_unknown`;
- occurred_at;
- correlation/idempotency key nullable.

Record attempts at the centralized YouTube-call boundary because invalid YouTube API requests can also consume quota. For ambiguous network failures, record the attempt rather than pretending it was free.

Aggregation is by the YouTube quota day (Pacific Time), not browser local midnight.

### API/UI

Provide a read endpoint such as:

`GET /quota/today`

Response should separate buckets and include:

- tracked usage;
- configured limit;
- reset time;
- source/meaning = MoyaStudia-tracked estimate;
- last recorded operation time.

The compact Studio header can show general usage. Cabinet/Account can show the detailed bucket breakdown and explanation.

The existing browser preferences `dailyEdits` / `dailyUploads` are product preferences, **not YouTube API quota**, and must not be reused as quota truth.

## 7. Central YouTube gateway

Before several write endpoints are added, extract a small server-side gateway around YouTube execution.

Responsibilities:

- obtain credentials/service;
- operation name;
- quota ledger recording;
- normalized Google/YouTube errors;
- retry policy;
- correlation/idempotency metadata;
- observability without secrets.

Do not hide domain ownership checks inside this gateway; ownership stays at service/route boundaries.

Retry only transient failures. Do not automatically retry a mutation when the remote outcome is unknown unless the operation is proven idempotent or remote state is reconciled first.

## 8. AI integrations

AI is optional and separate from YouTube OAuth.

### Secret storage

- API keys are submitted only to backend endpoints over HTTPS;
- encrypt at rest using a dedicated secret-encryption abstraction;
- never return the plaintext key after creation;
- frontend receives provider, model, status and a masked hint only;
- never put keys in `localStorage`, Next.js public env, logs, analytics, URLs or error text;
- support replace/delete/test-connection operations;
- prefer a separate encryption purpose/key from OAuth tokens when production secret management is introduced.

Suggested model: `AIConnection` owned by `User` with provider, encrypted credential, optional model/defaults, created/updated timestamps.

### Improve buttons

Initial actions:

- improve title;
- improve description;
- improve tags.

Input is the current working draft plus only the minimum channel/video context needed. Output is a **suggestion/diff**, never an automatic YouTube mutation.

Flow:

1. request suggestion;
2. show proposed text/diff;
3. user accepts/rejects;
4. accepted value updates local working state;
5. ordinary local save / Send to YouTube flow remains unchanged.

This keeps AI outside the write security boundary.

## 9. Google connection lifecycle

Current UI hides a Google connection with zero selected channels; that is not the same as disconnecting it.

Add explicit operations later:

- disconnect Google account from MoyaStudia;
- revoke access where supported;
- reauthorize;
- remove one selected channel;
- cleanup/retention according to product policy.

Never infer `disconnect Google` from merely removing a channel unless the product flow explicitly confirms that consequence.

Connection UI should distinguish:

- account connected;
- reauthorization required;
- channels managed by MoyaStudia;
- active Studio channel.

## 10. Persistence additions

Likely migrations, introduced only with their implementation stage:

1. user write-mode setting (or settings table);
2. quota ledger;
3. AI connections;
4. optional mutation/idempotency records if a dedicated table is needed;
5. server-side channel preferences only if cross-device channel language/settings are required.

Do not create all future tables preemptively.

## 11. API shape

Names are design targets, not committed contracts.

- `GET /write-mode`
- `PUT /write-mode`
- `POST /channels/{channel_id}/videos/{video_id}/youtube-metadata`
- `GET /quota/today`
- `GET/POST/DELETE /ai-connections...`
- `POST /ai/improve`
- playlist mutation routes under owned channel/playlist resources
- explicit Google disconnect/revoke route

Mutation responses should use typed machine-readable error codes for at least:

- write_mode_disabled;
- connection_reauthorization_required;
- ownership/not_found;
- working_revision_conflict;
- youtube_conflict;
- validation_failed;
- quota_exhausted;
- youtube_rate_limited;
- youtube_rejected;
- remote_outcome_unknown.

Do not expose raw provider exception strings to the browser.

## 12. Testing requirements

Before enabling the first YouTube write button, automated tests must cover:

- Write Mode OFF rejects server-side mutation;
- wrong user/channel/video ownership rejects mutation;
- reauthorization-required connection rejects mutation;
- working revision conflict does not overwrite remote state;
- successful YouTube write updates local snapshot/base correctly;
- failed write preserves local draft;
- quota attempt is recorded for success and provider error;
- quota day boundary uses Pacific Time;
- quota exhaustion prevents new operation;
- provider errors contain no tokens/secrets;
- idempotent/repeated request behavior;
- AI key never appears in GET responses/loggable response structures;
- AI suggestion cannot directly mutate YouTube.

CI remains mandatory before merge.

## 13. Implementation order

### W1 — prepare code boundaries
Split oversized frontend feature code only where needed for the next feature. Introduce backend YouTube gateway/error types without behavior change.

### W2 — quota ledger for existing reads
Instrument current read/sync calls first. Expose `GET /quota/today`. Replace the decorative quota presentation with real MoyaStudia-tracked usage.

### W3 — server Write Mode
Persist server-authoritative OFF/ON state, endpoint and UI confirmation. Still no YouTube writes.

### W4 — single-video metadata write
Implement `videos.update` for title/description/tags with revision/conflict handling, quota ledger and tests. Enable the existing Send to YouTube action only here.

### W5 — thumbnail/status/scheduling
One capability at a time, each with confirmation/validation and tests.

### W6 — playlists
Single playlist mutations first; bulk orchestration second.

### W7 — connection lifecycle
Explicit disconnect/revoke/reauthorize and cleanup behavior.

### W8 — AI
Encrypted provider connections, test connection, suggestion endpoints, then activate Improve buttons.

### W9 — upload/drafts
Temporary resumable media and PRIVATE-first `videos.insert`. Keep this later because upload lifecycle/storage is substantially larger than metadata writes.

## 14. Documentation rule

For every W-stage:

- update `STATUS.md` with what is actually implemented and validated;
- update this design if a contract changes;
- update `README.md` only when user-facing/current capability changes;
- record migrations and operational setup in `HOWTOSTART.md`;
- never describe a planned capability as implemented.
