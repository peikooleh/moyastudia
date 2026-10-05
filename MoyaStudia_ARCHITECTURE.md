# MoyaStudia — Architecture & Product Specification

Version: 1.0
Status: Architecture baseline
Purpose: product/domain reference for implementation agents.

> **Важно:** этот документ описывает архитектурный baseline и целевую модель; он не является источником истины о текущем implementation status. Проверяйте реализованные функции и ограничения в [STATUS.md](STATUS.md).
>
> Детальный baseline следующей фазы (Write Mode, quota ledger, AI secrets, mutation safety и порядок реализации W1–W9) находится в [WRITE_MODE_DESIGN.md](WRITE_MODE_DESIGN.md). Он дополняет этот документ и также не означает, что функции уже реализованы.

## 1. Product goal

MoyaStudia is a SaaS interface for managing YouTube channels and content. The long-term goal is to minimize the need to use YouTube Studio while keeping storage, API usage, and infrastructure costs low.

YouTube remains the external source of current published state. MoyaStudia stores only the minimum useful local working/cache data.

If an operation cannot be performed through the available YouTube APIs, MoyaStudia should explain that limitation and offer to open YouTube Studio rather than pretending the operation succeeded.

## 2. Core principles

### Data minimization
- Do not permanently store uploaded video files.
- Do not download existing YouTube video files.
- Temporary media is deleted immediately after successful transfer or final failure.
- Do not store unselected YouTube channels.
- Do not keep unnecessary user action history.
- No notification history.

### Security
- OAuth tokens must be stored securely.
- Validate OAuth state.
- Enforce server-side ownership for every protected resource.
- Use least-privilege scopes.
- Never expose secrets to frontend code.
- Deleting a MoyaStudia account must never modify YouTube content.

### Incremental implementation
Do not implement the entire future product at once. Build foundation first, then add YouTube write functionality incrementally.

## 3. Identity and accounts

MoyaStudia login providers:
- Google ID
- Apple ID

Google/YouTube connections are separate from MoyaStudia identity.

If Google and Apple appear to use the same email, do not merge automatically. Ask the user for explicit confirmation.

One MoyaStudia account may connect multiple Google accounts.

Current model is one owner per connected channel. Team roles and shared permissions are future functionality only.

## 4. Google/YouTube connections

A Google account may contain multiple YouTube channels.

Connection flow:
1. Authenticate.
2. Discover available channels.
3. Let the user select channels.
4. Persist only selected channels.

Unselected channels are not stored as connected resources.

Removing a channel:
- remove it from MoyaStudia;
- if it is the last channel of that Google connection, revoke the Google/YouTube OAuth connection;
- delete MoyaStudia data for the channel;
- do not keep a hidden archive.

If a Google connection is disconnected while channels remain:
- mark it inactive;
- retain local cache for 7 days;
- YouTube operations are unavailable;
- show cached data as potentially outdated;
- reconnecting triggers synchronization;
- after 7 days without reconnection, delete the retained local data.

If the same Google account is reconnected, perform a full synchronization of its selected channels.

## 5. Video model and lifecycle

A video has:
1. MoyaStudia working state.
2. YouTube external state.

Conceptual internal states:
- DRAFT
- READY_TO_UPLOAD
- UPLOADING
- PRIVATE
- READY_TO_PUBLISH
- SCHEDULED
- PUBLISHED
- ERROR

YouTube visibility/status is stored separately.

After successful upload:
- create/upload as PRIVATE;
- attach the YouTube video ID to the existing MoyaStudia draft;
- change that same record to PRIVATE;
- never create a duplicate record.

MoyaStudia must never silently publish a newly uploaded video.

## 6. Drafts and temporary media

Draft inactivity TTL: 24 hours.

Activity means:
- opening the draft;
- changing the draft.

Each activity resets the 24-hour timer.

Before automatic deletion, show a short toast with the remaining time.

Draft video files are temporary. If a draft is closed/interrupted, its video file is not retained permanently.

Temporary media:
- use a storage abstraction/provider interface from the beginning;
- use resumable/chunked upload;
- do not load large videos entirely into RAM;
- delete temporary files immediately after successful transfer;
- delete them after final failure as well.

Future persistent storage may be added behind the same abstraction.

## 7. Existing YouTube catalog

MoyaStudia does not download existing video files.

Minimum persistent video/cache fields:
- youtube_video_id
- channel_id
- internal status
- YouTube visibility/status
- title
- description
- tags
- thumbnail URL
- playlist IDs
- creation/publication/update dates
- last synchronization time

Additional fields are loaded lazily when needed.

All existing videos become part of the local catalog.

Initial import is:
- paginated;
- progressive;
- non-blocking for the already loaded portion.

Readiness is calculated as videos arrive.

If YouTube is temporarily unavailable:
- show the last cache;
- mark it as potentially outdated;
- do not present it as current.

If a video was deleted on YouTube:
- remove it from MoyaStudia during synchronization;
- do not retain an archive.

Synchronization is triggered by:
- opening the relevant section;
- explicit manual synchronization.

No continuous polling.

## 8. Readiness

Readiness has three levels:
- BLOCKER — publication impossible;
- WARNING — publication allowed, but a recommendation is shown;
- INFO — informational recommendation.

Global base blockers:
- title exists;
- description exists;
- tags exist.

Thumbnail is NOT a blocker. Missing thumbnail is a WARNING.

Existing videos with warnings may remain fully usable. Warnings do not block ordinary actions.

Each channel can define additional rules. Users can create rules with:
- Blocker;
- Warning;
- Info.

Initial rule conditions should be a predefined supported set, including:
- title filled;
- description filled;
- tags filled;
- thumbnail exists;
- playlist selected;
- specific playlist;
- visibility/status;
- video language;
- category;
- scheduled date/time;
- other supported video fields as implemented.

Do not build an arbitrary programming-language rule engine.

## 9. Publishing and scheduling

Status changes are explicit user actions.

PUBLIC and SCHEDULED are changed one video at a time.

PRIVATE and UNLISTED may be mass-applied.

Every mass status change requires explicit confirmation showing:
- number of videos;
- current/new status;
- relevant parameters;
- Cancel / Confirm.

Scheduled publication is handled by YouTube once the schedule is successfully sent. MoyaStudia does not need to remain open.

Moving a scheduled video:
1. change working state;
2. ask for explicit confirmation;
3. send the new schedule to YouTube.

Failed scheduling/publishing:
- keep a usable working state such as READY_TO_PUBLISH or ERROR;
- show the reason;
- offer manual retry;
- never silently publish.

## 10. Bulk operations

All bulk mutations use one confirmation pattern:
- number of affected videos;
- exact operation;
- parameters;
- Cancel / Confirm.

No bulk deletion.

### Tags
- bulk addition only;
- no bulk removal/replacement;
- do not add a tag if it already exists;
- individual tag deletion is supported in the video editor.

### Description
- bulk addition to beginning or end;
- no bulk replacement/deletion.

### Title
- bulk addition to beginning or end;
- no bulk replacement/deletion.

### Playlists
- selected videos may be added to multiple selected playlists in one operation;
- bulk removal from playlists is not supported in the current design.

### Partial completion
If a bulk operation partially succeeds:
- do not roll back successful changes;
- show exact result, e.g. 63/100;
- allow retry for remaining items.

Quota exhaustion:
- stop the operation;
- show a clear message;
- do not silently retry exhausted quota.

Technical retry is acceptable only for short-lived network failures.

## 11. Search and sorting

Search should cover:
- title;
- description;
- tags;
- playlists;
- status;
- channels.

Sorting should include:
- title;
- publication date;
- modification date;
- status.

Saved views are future functionality.

## 12. Calendar

Full content calendar for:
- drafts;
- ready items;
- private videos;
- scheduled videos;
- published videos.

Supports multiple channels with filtering by channel.

Scheduled moves require explicit confirmation before updating YouTube.

## 13. Playlists

Long-term playlist target:
- create;
- rename;
- edit description;
- reorder;
- add videos;
- remove videos;
- delete.

Current bulk policy still forbids bulk removal.

## 14. Comments

Target:
- view;
- reply;
- delete;
- moderate.

No permanent notification center.

Community Posts are future functionality only.

## 15. Channel management

Target API-supported channel functionality:
- name;
- description;
- links/basic information;
- branding;
- avatar;
- banner;
- other supported settings.

Branding files are temporary under the current storage policy.

## 16. Channel settings

Per-channel settings:
- default status: PRIVATE;
- default playlist;
- timezone;
- readiness rules;
- description templates;
- standard tag templates;
- future channel-specific behavior.

Global settings and channel settings remain conceptually separate.

## 17. Templates

Support:
- global description templates;
- channel-specific description templates;
- global tag templates;
- channel-specific tag templates.

Templates populate editable working data. They do not prevent manual editing.

No placeholder/variable engine initially.

## 18. Thumbnail library

No permanent thumbnail library initially.

Create an abstraction/interface now so a future persistent library can be added when storage is available.

## 19. Analytics

Initial on-demand analytics:
- views;
- likes;
- comments;
- average view duration;
- watch time;
- subscribers gained where available;
- CTR and impressions where available.

Do not build a historical analytics warehouse initially.

## 20. UI and UX

Main navigation:
- Dashboard
- Channels
- Videos
- Calendar
- Playlists
- Comments
- Analytics
- Settings

Dashboard is the work center:
- items requiring attention;
- drafts;
- ready-to-upload items;
- scheduled publications;
- errors;
- relevant conflicts/differences;
- recent videos;
- short basic analytics.

Heavy sections load lazily.

Attention items include:
- upload/publish errors;
- conflicts/differences;
- missing required elements;
- schedule problems;
- drafts nearing deletion;
- synchronization problems;
- disconnected connections.

Desktop-first, responsive from the beginning. Mobile access is not blocked; it simply does not need to be as convenient as desktop.

Notifications are short, informative, non-distracting toasts only.

## 21. UI language and settings

UI language must use external language files. Adding a language should primarily require adding a language file.

Initial UI language: Russian.

Theme:
- system;
- light;
- dark.

Timezone:
- browser/device default;
- manual override.

Date/time:
- YYYY-MM-DD;
- 24-hour clock.

Scheduled times are interpreted using the configured user timezone and converted for YouTube as necessary.

## 22. Database

Target backend stack:
- FastAPI;
- SQLAlchemy;
- PostgreSQL.

Core ownership model:
- MoyaStudia user/account;
- identity providers;
- Google connections;
- connected YouTube channels;
- videos;
- YouTube identifiers/status;
- playlists;
- readiness rules;
- templates;
- settings;
- temporary/draft lifecycle.

Every protected resource must be traceable to its owner.

Use Alembic for all production schema evolution. Do not use create_all as the production migration mechanism.

## 23. OAuth security

Required:
- authenticated MoyaStudia session;
- secure Google OAuth;
- validated OAuth state;
- secure refresh-token storage;
- least-privilege scopes;
- server-side ownership checks.

Known prototype issues to eliminate:
- mock/local sign-in;
- missing OAuth state validation;
- plaintext refresh tokens;
- excessive scopes;
- simplistic single-channel discovery;
- unauthenticated channel/video endpoints;
- global channel access;
- missing ownership model.

## 24. API architecture

Backend:
- FastAPI;
- SQLAlchemy;
- PostgreSQL.

Frontend:
- Next.js App Router;
- React.

Protected endpoints enforce:
1. authentication;
2. ownership;
3. YouTube connection status;
4. operation-specific authorization.

Keep YouTube API access centralized enough to control quota, retries and error handling.

Use explicit response schemas as the API matures.

## 25. Retention

- Draft inactivity: 24 hours.
- Disconnected Google connection/cache: 7 days.
- Deleted channel: immediate local deletion.
- Deleted MoyaStudia account: delete MoyaStudia data and revoke OAuth access.
- Technical DB backups: minimal necessary backup, 7-day retention.

No user-facing audit/history system now.

## 26. Privacy

Product policy:
- store nothing unnecessary;
- transfer nothing unnecessary;
- prevent data leakage;
- do not sell user data;
- do not use user content for unrelated purposes.

No permanent video-file storage in the current architecture.

## 27. Error handling

Errors must be explicit and actionable.

Examples:
- YouTube unavailable → cached data + outdated marker;
- OAuth failure → clear error;
- upload failure → delete temporary file + retry;
- quota exhaustion → stop and report partial result;
- publish failure → preserve working state + reason + manual retry;
- disconnected connection → disable unavailable YouTube operations.

## 28. Idempotency

Critical operations must avoid duplicate records/actions.

Successful upload must attach the YouTube video ID to the existing draft and transition that record to PRIVATE.

Future mutations should use idempotency mechanisms where appropriate.

## 29. Testing

Test critical business logic from the beginning:
- authentication;
- OAuth state;
- ownership/isolation;
- connection lifecycle;
- multi-channel discovery;
- synchronization;
- deletion;
- draft TTL;
- upload lifecycle;
- readiness;
- publishing;
- scheduling;
- bulk operations;
- partial completion;
- quota/error handling;
- disconnected retention;
- account deletion.

Do not attempt exhaustive UI coverage initially.

## 30. CI

GitHub CI on Pull Requests:
- backend checks;
- frontend checks;
- tests;
- lint;
- build.

Critical failures must block merging.

## 31. Implementation stages
Эти этапы — продуктовый roadmap, а не отчёт о завершённой реализации. Текущий статус реализации см. в `STATUS.md`.

### Stage 1 — Foundation
Identity, ownership, secure sessions, Google connections, OAuth security, Alembic, core DB model, tests, CI.

### Stage 2 — Connection lifecycle
Multiple Google accounts, channel discovery, selected channels, disconnect/reconnect, retention, revoke logic.

### Stage 3 — Catalog/sync
Video model, progressive import, cache, synchronization, deleted-video handling.

### Stage 4 — Draft/readiness
Drafts, TTL, metadata editor, templates, readiness engine, per-channel rules.

### Stage 5 — Upload
Temporary storage abstraction, resumable upload, PRIVATE upload, same-record transition, cleanup.

### Stage 6 — Publishing/calendar
Explicit status changes, scheduling, readiness validation, calendar.

### Stage 7 — Bulk operations
Tags, title additions, description additions, playlist additions, supported status changes, partial/quota handling.

### Stage 8 — Playlists
Full playlist management.

### Stage 9 — Comments
Viewing, replies, deletion/moderation.

### Stage 10 — Channel management
Channel metadata, branding and API-supported settings.

### Stage 11 — Analytics
On-demand basic analytics, later full Analytics integration.

### Stage 12 — Future
Thumbnail library, persistent media storage, Community Posts, team/roles, audit log, historical analytics and other API-supported functionality.

Do not implement later stages prematurely.

## 32. Agent operating rules

Before changing code:
1. inspect the current implementation;
2. identify the smallest correct change;
3. compare it with this document and AGENTS.md;
4. avoid opportunistic refactors;
5. do not change dependencies unless required;
6. do not broaden OAuth scopes without a current task requiring it;
7. do not perform YouTube write operations without explicit task scope;
8. do not commit, push, reset, clean, restore, checkout, rebase or merge unless explicitly instructed;
9. never expose .env, credentials, tokens or secrets;
10. run relevant validation after changes.

If the current code contradicts this architecture:
- do not silently preserve the contradiction;
- report it before a broad architectural change.

Completion report:
- Changed
- Validation
- Out of scope
- Remaining risks

## 33. Historical prototype blockers

The following list describes the pre-foundation prototype. It is historical context, not a list of current blockers:
1. mock/local authentication;
2. missing OAuth state validation;
3. insecure refresh-token storage;
4. excessive YouTube scopes;
5. simplistic channel discovery;
6. missing server-side ownership isolation;
7. incomplete user/identity DB model;
8. incomplete video/cache model;
9. no Alembic migration system;
10. weak/untyped API contracts;
11. duplicated frontend API configuration;
12. weak error handling;
13. missing meaningful automated tests;
14. missing CI;
15. mock/demo UI values;
16. stale documentation.

These are migration targets, not a reason to rewrite the whole project at once.

## 34. Success criteria

MoyaStudia should evolve from the current read-only prototype into a secure multi-channel YouTube management SaaS without repeatedly rewriting the core domain.

The resulting architecture must support:
- multiple Google accounts;
- multiple selected channels;
- server-side ownership;
- predictable synchronization;
- minimal local storage;
- temporary/resumable media handling;
- deliberate publishing;
- readiness-driven workflows;
- safe bulk operations;
- future storage/thumbnail/team/advanced YouTube features through clear abstractions.

