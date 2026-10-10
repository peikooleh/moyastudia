# Current Status — 2026-10-10

> **Текущий рабочий статус.** Актуальная ветка: `fix-youtube-status-calendar-2026-10-08`, создана от merge `5143460` в `main`. Предыдущая ветка `page-audit-refinement-2026-10-08` сохранена для отката. Исторические записи ниже относятся к состоянию на 8 октября.

## Исправление статусов видео и календаря

- Исправлен подтверждённый дефект: incremental sync больше не останавливается при встрече знакомого YouTube video ID. Обычный refresh обходит **все страницы uploads playlist** и обновляет изменяемые `privacyStatus`, `publishAt` и остальные snapshot-поля всех известных видео.
- Исправлен подтверждённый дефект календаря: ISO UTC timestamp теперь преобразуется в локальный календарный день браузера перед распределением событий по клеткам; UTC-публикации около полуночи больше не сдвигают событие на неверный день.
- Добавлены backend regression tests на изменение `unlisted` и `publishAt` у старых видео на следующей странице, а также на восстановление **7/7 unlisted** в фильтре и счётчике после двухстраничного обновления. Frontend tests покрывают локальную дату и переход через полночь в Europe/Zurich.
- Календарь по текущему коду запрашивает все страницы каталога для 42-дневного окна. Режим `reconcile` по-прежнему отдельно обрабатывает удалённые или исчезнувшие YouTube IDs.
- **Реальная проверка остаётся открытой:** после установки изменений нужно выполнить обычное обновление каталога на канале MOYAMOVA и сверить 7 видео «По ссылке», запланированные даты и календарь с YouTube Studio. GitHub CI не имеет доступа к локальной PostgreSQL и пользовательскому OAuth YouTube.
- Никаких YouTube mutations эти изменения не выполняют. Детали: `AUDIT_VIDEO_STATUS_CALENDAR_2026-10-08.md`.

## Проверки

- Полный CI на `932bd97` (последний коммит с изменением исполняемого кода/тестов) — **успешен**: backend **179 passed, 3 warnings**; frontend **38/38 passed**; EN/RU/UK **684 unique keys, no duplicates**; ESLint **0 errors** (известные предупреждения `<img>` и custom font); Next.js production build **успешен, 7/7 static pages**; `pip-audit` — **No known vulnerabilities found**.
- Последующие коммиты изменяют только документацию; CI для них также выполняется отдельно.

---

# Current Status — 2026-10-08

> **Источник истины для текущего состояния проекта.** Исторический журнал ниже сохраняется для контекста и может описывать уже superseded ветки, ограничения и validation counts. При расхождении ориентироваться на этот раздел и текущий код указанной ветки.

## Текущая база

- `main`: `e3c4b8d` — merge audit remediation + visual polish.
- Текущая рабочая ветка: `page-audit-refinement-2026-10-08`, HEAD перед этой записью — `e0f29f2`. Изменения этой ветки ещё не слиты в `main`.
- Полный CI на `e0f29f2` завершён успешно 2026-10-08: backend `pytest` — **178 passed, 3 warnings**; `pip-audit` — **No known vulnerabilities found**; frontend Node tests — **36/36 passed**; i18n parity — **684 unique keys EN/RU/UK, no duplicates**; ESLint — **без ошибок** (остаются известные неблокирующие Next.js warnings по `<img>`); Next.js production build — **успешно**, static generation **7/7**.
- CI включает backend tests + pip-audit и frontend tests + i18n parity + lint + production build.

## Фактическое состояние интерфейса и логики

- Videos: page-specific preferences изолированы; сортировка дат по умолчанию newest-first, подписи сокращены до **Новые / Старые**; status/availability semantics разделены; строки списка увеличены до 96 px, чтобы дата/время не обрезались.
- Catalog sync: пользовательские состояния синхронизации уточнены; обычное обновление и полная сверка YouTube разведены; полная сверка находится во вторичных действиях; каталог старше 24 часов визуально отмечается и получает подсказку на обновление; активный sync-state стабилен при переходах между страницами.
- Playlists: page-specific preferences изолированы; bulk visibility/status staging реализован отдельно от membership actions; toolbar выровнен и уплотнён; page-size selector корректно показывает трёхзначные значения; structured API errors больше не рендерятся как `[object Object]`.
- Calendar: сетка фиксирована на **6 строк × 7 дней (42 дня)**; соседние даты месяца приглушены; стрелки двигают окно на **1 неделю**; wheel/scroll-навигация полностью удалена после эксперимента; preloaded data остаётся видимой при переходе; верх preview/details выровнен с поиском.
- Statistics: video scope сортируется по фактической publication date; фильтры/состояния страниц не протекают в другие разделы.
- Cabinet: channel list получил hover без изменения геометрии; light/dark danger states используют theme token `var(--danger)`.
- EN/RU/UK локализации синхронны: 684 уникальных ключа в каждом locale, duplicate keys отсутствуют.

## Каналы — открытая проверка

- Реальный сценарий 2026-10-08: после удаления всех каналов Google account и YouTube channel обнаруживаются, но при повторном сохранении выбранного канала UI показал «Не удалось сохранить выбор».
- Добавлен regression test на цепочку **удалить последний managed channel → сохранить Google connection → обнаружить тот же YouTube channel → добавить его снова**. Тест проходит в CI.
- Наблюдавшийся реальный сбой пока **не считается закрытым**: тестовый backend-path корректен, но нужно снять фактический HTTP status/detail неудачного POST/refresh и устранить расхождение PostgreSQL/runtime-сценария с тестовой средой.
- UI сейчас объединяет ошибку POST сохранения и ошибку последующего refresh списка каналов в близкое сообщение; при диагностике это нужно разделить, чтобы видеть точный этап сбоя.

## Реально доступные функции

- Google identity + отдельный Google/YouTube OAuth, server-side sessions, owner scoping и encrypted refresh tokens.
- Локальный YouTube catalog с initial/incremental/full reconciliation, working state, conflict/revision handling, filters/sorts и local drafts.
- Server-authoritative Write Mode для поддерживаемых YouTube mutations.
- Видео: working metadata (title/description/tags/language/category/made-for-kids), visibility/scheduling, thumbnail и captions paths.
- Playlists: remote/local playlist flows, metadata/privacy, thumbnail, membership, reorder и удаление playlist item; поддерживаемые remote mutations защищены Write Mode.
- Channels/Cabinet: выбор каналов, refresh profile, persistent working language, description/keywords write, share/open link и локальное удаление managed channel.
- Statistics: channel/playlist/public-video scopes, catalog refresh, YouTube Analytics summary/timeseries и интерактивные KPI.
- Quota: server-side MoyaStudia ledger для YouTube Data API.
- AI connections: provider/model/API key/prompts сохраняются server-side; API key encrypted at rest и не возвращается plaintext. **Реального AI provider execution пока нет.**

## План на 2026-10-09 — реализация AI-функционала

1. Зафиксировать контракт AI Improve без изменения принятого интерфейса: входные поля, результат, лимиты и ошибки.
2. Реализовать server-side provider execution поверх существующих AI connections. Ключи используются только backend; plaintext key никогда не передаётся в browser и не логируется.
3. Начать с уже подготовленных сценариев **улучшения title и description**; использовать сохранённые provider/model/prompts и текущий текст как вход. AI-result попадает только в local draft/preview — **никакой автоматической отправки на YouTube**.
4. Сохранить текущую модель безопасности: AI action отдельно от Write Mode/YouTube write; применение AI-result пользователем само не выполняет YouTube mutation.
5. Добавить timeout, provider/network error mapping, response validation, input/output limits и защиту от пустого/невалидного результата.
6. Подключить существующие AI Improve controls к реальному endpoint, добавить loading/cancel/error/result states и возможность принять либо отклонить предложение.
7. Покрыть backend tests: owner scope, missing key, provider failure, timeout, malformed response, encrypted-key boundary, prompt/model selection; frontend tests — request/result/error/cancel и EN/RU/UK parity.
8. После реализации — ручная проверка UI light/dark, затем полный gate: pytest, pip-audit, frontend tests, i18n parity, lint, production build.

## Текущие ограничения / долг

- AI provider execution ещё не реализован; это главный функциональный план на 2026-10-09.
- Реальный сбой повторного подключения канала после удаления всех каналов остаётся открытым до runtime-диагностики, несмотря на зелёный regression test.
- MoyaStudia не хранит и не загружает большие исходные видеофайлы; полноценного video upload pipeline нет.
- Нет destructive удаления YouTube video/channel. `DELETE /channels/{id}` удаляет только managed-channel запись MoyaStudia.
- Google connection lifecycle не является полноценным Google revoke/disconnect flow.
- Legal pages остаются launch placeholders.
- `studio.js`, `globals.css` и `i18n.js` остаются крупными; делить только по реальным feature boundaries.
- Известные CI warnings: FastAPI/Starlette deprecations, Next.js `<img>` optimization warnings и GitHub Actions Node runtime deprecation notices; они не блокируют текущий gate.

---

# Historical development log

# Statistics v3 UI convergence — 2026-10-06

## Scope and reference baseline

- Performed a source-level UI consistency pass across Videos, Playlists, Calendar, Statistics and Cabinet on `feature-statistics-v3`.
- Videos, Playlists and Calendar remain the accepted visual/reference baseline. Their page layouts were audited rather than redesigned in this pass.
- Restored the pre-rollback Statistics dashboard geometry from the old polished implementation while keeping the isolated `statistics-dashboard.js` architecture and current Analytics/data-loading implementation.
- Statistics CSS remains scoped under `.statistics-*`; the restoration does not reintroduce the old Statistics-to-Video layout coupling that caused the previous regression.

## Statistics polish completed

- Restored the accepted dashboard rhythm: heading/coverage badge, channel/scope/period controls, four KPI cards, views trend, engagement/content panels and responsive breakpoints.
- Channel picker and native scope/target selects now use a consistent dropdown language. Native selects retain the browser control used by the accepted Studio pages; the custom channel picker uses a matching CSS caret rather than a text glyph.
- Added localized EN/RU/UK hints for channel, scope, playlist/video target and reporting-period controls.
- Restored status drill-down from Statistics content composition to Videos: selecting Public / Private / Unlisted / Scheduled clears search, applies the corresponding Videos filter, resets date sorting/selection and opens the Videos workspace.
- Status drill-down has localized EN/RU/UK tooltips and keyboard focus/hover treatment.
- Statistics continues to load its own complete catalog independently and keeps channel / playlist / video Analytics scopes and 7 / 28 / 90 / 365 / lifetime periods.

## Statistics visual review accepted — 2026-10-06

- Manual browser review accepted the first post-audit Statistics pass.
- Statistics now uses the same page-heading scale as the accepted Studio pages; the former overview eyebrow, dashboard intro and duplicate catalog-count badge were removed.
- The Statistics outer workspace now follows the Studio page edge/padding rhythm while preserving the existing KPI/chart/lower-panel dashboard structure.
- Statistics labels and supporting text were brought toward the shared Studio typography scale; primary controls were reduced to the shared ~38 px control height and the channel avatar was scaled with them.
- All four KPI cards now have equal visual treatment; the first Views card no longer carries a selection-like accent.
- Deferred intentionally until later: duplicate Statistics CSS consolidation, shared radius normalization and Ukrainian Statistics locale parity work.

## Videos top rhythm accepted — 2026-10-06

- Manual browser review accepted the Videos page-order correction.
- The shared catalog-state row now appears before the Videos page heading, matching the page rhythm used by the other Studio workspaces.
- No Videos catalog, toolbar, list, Inspector, editor or write-flow visuals/logic were changed in this step.

## Calendar visual review accepted — 2026-10-06

- Manual browser review accepted the Calendar spacing pass.
- The Calendar detail panel was slightly tightened without changing its grid, calendar structure, event cards or scheduling/write logic.
- The shared Studio catalog-state row no longer shifts horizontally when switching between Videos, Playlists, Calendar and Statistics; the root viewport now reserves stable scrollbar space.
- Calendar YouTube-link metadata was corrected so the short video URL, Copy link action and Open video action read cleanly inline in one row.
- No other Calendar layout or behavior was changed in this accepted pass.

## Playlists visual review accepted — 2026-10-06

- Manual browser review accepted the Playlists compact-control pass.
- Existing compact control heights were preserved intentionally (bulk actions 32 px, compact selects/pagination around 34 px, reorder controls 25 px); stray compact-control radii were aligned with the shared control radius instead of enlarging the controls.
- The Playlists YouTube action was verified in source to target the playlist URL (youtube.com/playlist?list=<playlist id>), not a video URL.
- The visible YouTube action now explicitly says Open playlist on YouTube in EN/RU/UK, matching its existing playlist-specific tooltip.
- The playlist YouTube action is kept on one line without widening the fixed settings column or taking space from the metadata editor.

## EN/RU/UK locale parity restored — 2026-10-06

- The missing Ukrainian Statistics / YouTube Analytics package was traced to 38 Ukrainian entries accidentally living inside the Russian locale block ahead of Russian duplicates.
- Those existing Ukrainian translations were moved into the proper `uk` locale block and removed from `ru`; no fallback-to-English is now required for those Statistics/Analytics keys.
- Added `apps/web/scripts/check-i18n-parity.mjs` and the `npm run check:i18n` command to fail when RU or UK key sets diverge from EN.
- Local validation on Windows/Node 24.13.0 completed successfully: `i18n parity OK: 625 keys in EN/RU/UK`.
- A pre-existing `comingLater` duplicate exists equally in all three locale blocks; it is outside this Statistics parity fix and was intentionally left untouched in this pass.

## Shared radius and separator review accepted — 2026-10-06

- Manual browser review accepted the shared semantic-radius pass. The existing radius system remains authoritative: 6 px small/internal controls, 8 px primary controls, 12 px large cards/panels, and pill radii where semantically appropriate.
- Statistics channel-menu and period controls were normalized to the existing small-control radius token; intentional shapes such as avatars, progress bars, chart marks, thumbnails, Calendar event strips, and pills were left unchanged.
- Videos left-column structure now follows the accepted Playlists pattern: the page heading lives inside the list column, toolbar sizing stays within the column, and heading/toolbar separators no longer double.
- Duplicate horizontal separators were removed at the Playlist summary/tools boundary and from the Video properties column below the preview, leaving one visual divider per section boundary.
- The user completed browser review and accepted the resulting Video and Playlist geometry.

## Final validation — Statistics v3 convergence — 2026-10-06

- Final manual browser review is accepted for Statistics, Videos, Calendar, and Playlists, including the consolidated Statistics controls and long-video-title selector case.
- Frontend i18n parity check passed for EN/RU/UK.
- Frontend catalog unit test passed.
- Frontend lint passed.
- Next.js production build passed.
- Full backend pytest suite passed.
- The `feature-statistics-v3` implementation is green after the final visual and source-level cleanup.

## Statistics final controls and CSS consolidation accepted — 2026-10-06

- Statistics v3 base CSS was consolidated to one active source by removing the older overridden v3 block; the unrelated legacy Statistics selectors were intentionally left untouched.
- The channel picker menu is positioned out of normal flow, so opening it no longer changes the controls-panel height. Channel secondary text was aligned to the shared compact-control typography.
- Statistics video scope now offers only catalog videos whose normalized status is `public`; scheduled, private, unlisted, unavailable, and deleted videos are excluded from the video selector.
- Period selection was converted from five persistent buttons to the same native select pattern used by the other Statistics controls, preserving 7 / 28 / 90 / 365 days and lifetime options.
- The four desktop controls are now Channel / Scope / target Playlist-or-Video / Period. Native selects are constrained with `width: 100%` and `min-width: 0`, preventing long selected video titles from overflowing into the Period column.
- During the period refactor, an accidentally removed shared Statistics control block was identified by source comparison and restored in place; obsolete period-button mobile rules were then removed explicitly.
- Manual browser review accepted the final controls layout, including the long-video-title case.

## Cross-page consistency audit

- Videos: retained accepted catalog/Inspector layout and existing localized search/filter/sort/editor hints.
- Playlists: retained accepted two-pane/detail/bulk-action layout and existing localized action/search/sort hints.
- Calendar: retained accepted calendar/queue/detail layout and existing localized navigation/manipulation hints.
- Cabinet: retained current hierarchy/layout; added localized EN/RU/UK hints to AI provider/model/API-key controls and retained the existing channel-language hint.
- Shared form controls continue to use the common theme/focus/disabled rules in `globals.css`; Statistics now follows that control language rather than overriding native select appearance.

## Final UI corrections and validation

- Videos catalog filtering now keeps scheduled uploads out of the generic Private filter; Scheduled remains a separate catalog status. Regression coverage was added in `tests/test_catalog.py`.
- Updated the OAuth scope regression expectation for the Statistics Analytics permission `yt-analytics.readonly`; the production scope itself was already intentional and correct.
- Videos and Calendar status-filter controls were corrected at their existing grid definitions so the longest localized status labels remain readable without adding CSS override selectors.
- Playlist `Change thumbnail` now matches the accepted Videos button sizing/typography while leaving the Videos reference control unchanged.
- Backend suite: **133 passed**, with 3 non-blocking dependency/FastAPI deprecation warnings.
- Frontend lint: **0 errors**. Existing non-blocking Next.js warnings remain for raw `<img>` usage/custom font handling; `next lint` itself is deprecated ahead of Next.js 16.
- Production build: **successful** on Next.js 15.5.27. Lint/type validation, page-data collection, static generation (7/7), build traces and page optimization all completed.
- Build warnings are non-blocking: existing image/font lint warnings plus Autoprefixer compatibility notices for `start`/`end` alignment values in `globals.css`.
- Browser visual smoke remains the final manual gate for accepted desktop/responsive UI before merge.

---

# Current Handoff — Functional Architecture, 2026-10-04

## UI baseline closed

- PR #1 was squash-merged into `main` as `da8b634` after green CI. The UI/UX polish phase is closed.
- The current production-development baseline remains read-only with local working metadata. No YouTube write, AI provider call or upload was enabled by the architecture work below.
- New design branch: `architecture-write-mode`.

## Next phase baseline

- Added [WRITE_MODE_DESIGN.md](WRITE_MODE_DESIGN.md) as the implementation contract for W1–W9.
- Write Mode will be server-authoritative and checked on every YouTube mutation; a disabled/enabled frontend button is not a security control.
- First remote mutation will be single-video title/description/tags via `videos.update`, preserving local drafts on failure and using working revision/conflict checks.
- Quota accounting will be a backend ledger around centralized YouTube execution. UI will explicitly label it as MoyaStudia-tracked usage rather than claiming Google's authoritative project balance.
- Official YouTube quota rules were rechecked on 2026-10-04. Current documentation uses separate default daily buckets for `search.list` and `videos.insert` (100 calls each, 1 unit/call) and a 10,000-unit combined default allocation for other endpoints; ordinary reads are generally 1 unit and most mutations 50. Reset is midnight Pacific Time. Costs must remain dated/configurable and be reverified before implementation.
- AI connections are optional future server-side integrations. API keys must be encrypted at rest and never stored in browser preferences or returned in plaintext. AI Improve actions produce suggestions/local draft changes only; they cannot directly write YouTube.
- Google connection lifecycle will get explicit disconnect/revoke/reauthorize behavior; hiding an empty connection in Cabinet is not considered a real disconnect.
- Implementation order is W1 boundaries → W2 quota ledger on reads → W3 server Write Mode → W4 single-video metadata write → W5 thumbnail/status/scheduling → W6 playlists → W7 connection lifecycle → W8 AI → W9 uploads/drafts.
- Each W-stage must update STATUS/documentation and pass relevant tests/CI before merge.

## W1/W2 implementation — in PR #2

- Added Alembic revision `0006_youtube_quota_usage` and `YouTubeQuotaUsage` ledger rows attributed to user/connection/channel while quota totals are aggregated at the shared Google Cloud project scope.
- Central YouTube request execution now records each instrumented request attempt as success or provider error with operation/bucket/cost. Existing channel discovery/profile, catalog sync, playlist list/items and video snapshot reads are instrumented.
- Added authenticated `GET /quota/today` with Pacific-Time quota window, bucket limits, tracked usage, estimated remaining and an explicit `authoritative_google_balance: false` marker.
- Studio header now shows the real tracked general-bucket usage (for example `API-квота 12 / 10000`) and explains that Google project usage may differ.
- Added quota tests for Pacific reset boundaries, authentication, aggregation and the dated operation-cost reference; migration coverage includes the new table.
- Quota telemetry now uses an isolated SQLAlchemy session/transaction so recording a YouTube request cannot commit unrelated pending domain changes in the request session.
- PR #2 is intentionally draft while CI and final review run.

## W3 implementation — in PR #2

- Added Alembic revision `0007_user_write_mode`: each authenticated user has a server-persisted Write Mode flag, default OFF.
- Added authenticated `GET /write-mode` and same-origin protected `PUT /write-mode`.
- Enabling requires the explicit confirmation token `enable_youtube_writes`; disabling does not require confirmation.
- API responses return `youtube_writes_available: true` because W4 now exposes a guarded metadata mutation; Write Mode still only arms writes and never sends one by itself.
- Studio's previous disabled Write Mode placeholder is now a real server-backed switch with EN/RU/UK confirmation copy and persisted state.
- `Save to YouTube` is enabled for the W4 metadata subset. Thumbnail/captions and real YouTube playlist mutations remain outside the active UI write surface.
- Added tests for default OFF, explicit confirmation, persistence/toggle behavior, authentication and same-origin enforcement, plus migration coverage.

## UI polish + channel watch time — in PR #2

- Moved the real server-backed Write Mode switch into the main application header beside sync/quota status. Removed the separate full-width Write Mode strip.
- Removed repeated temporary/helper copy from Video settings/actions and Statistics so permanent controls/data carry the interface instead of placeholder notices.
- Fixed Video scroll layering by making the catalog action/status bar non-sticky; it no longer overlays the selected video inspector while the page is scrolled.
- Added an embedded YouTube preview to the selected-video summary. The standard YouTube player provides play/pause, seek/progress, volume and fullscreen without duplicating playback state in MoyaStudia.
- Added owned-channel `GET /channels/{channel_id}/analytics/summary` backed by YouTube Analytics `estimatedMinutesWatched`, and a fourth Statistics headline card for total channel watch time.
- Watch time is not approximated from duration × views. It comes from YouTube Analytics for the channel date range and displays `—` if Analytics is unavailable.
- The YouTube Analytics API must be enabled for the Google Cloud project. Current Google documentation for `reports.query` requires `youtube.readonly`, which the existing YouTube connection already requests.
- Added owner/auth coverage for the analytics summary endpoint.

## W4 implementation — in PR #2

- Added the first real YouTube mutation: metadata update for one explicitly selected catalog video only.
- Supported fields are title, description, tags and video language. Language is now a local working-draft field and a Studio dropdown rather than a disabled raw code.
- Added migration `0008_video_working_language` for local/base language state.
- Added guarded `POST /channels/{channel_id}/videos/{video_id}/publish-metadata`: authentication, same-origin, ownership, Write Mode ON, exact working revision, no unresolved conflict, available remote video, server-side metadata validation and 50-unit tracked quota preflight are required before YouTube is contacted.
- Remote update uses `videos.update(part=snippet)` and preserves the existing YouTube category ID because YouTube requires category ID when updating snippet metadata.
- Successful remote writes replace the local YouTube snapshot and clear the published local working copy. Failed remote writes leave the local draft intact.
- W4 requests YouTube `youtube.force-ssl` in addition to `youtube.readonly`. Existing connections created before W4 must be reauthorized before the first write; the UI reports that requirement instead of silently failing.
- Added backend coverage for Write Mode OFF, stale revision, same-origin enforcement and successful single-video snapshot update.
- Metadata publish now locks the selected video row before validating the revision, preventing two concurrent requests from intentionally publishing the same working revision twice.
- Playlist read items now retain YouTube's `playlistItemId`. Backend-only YouTube primitives for playlist create/add/remove are present behind the common quota-recording executor and have unit coverage, but no application endpoint or UI invokes those remote mutations yet.
- Bulk operations, playlist writes and all YouTube delete operations remain unavailable. W4 exposes no delete endpoint.

## Known debt before/while implementing

- `studio.js`, `globals.css` and `i18n.js` are large; split only along feature boundaries needed by the next stage rather than doing a broad rewrite.
- Existing `dailyEdits` / `dailyUploads` browser preferences are not YouTube quota and must not be reused as quota truth.
- Channel language is browser-local; move it server-side only if cross-device persistence becomes a product requirement.
- Legal pages remain launch placeholders and require separate legal/localization review.

---

# Previous Handoff — Studio UI/UX, 2026-10-04

## A1–A11 UI batch

- **Videos:** accepted base layout retained; final QA removed the nested desktop Inspector scrollbar so the page owns vertical scrolling while the catalog list stays bounded.
- **Playlists:** compact bulk-action toolbar retained; playlist search with EN/RU/UK empty state added.
- **Calendar:** Today navigation is grouped with month controls. Overflow for busy days no longer expands a long list below the calendar; it opens a bounded right-side day list. Day rows now include thumbnail, title, date, views, likes and comments and open the selected video detail.
- **Statistics:** search, status filter and sorting are aligned in one toolbar. Sorting supports views, likes, comments, publication date and title. Rows include video thumbnails.
- **Cabinet:** channel/connection hierarchy and desktop containment polished. Channel language remains configurable here.
- **Onboarding:** channel-language selection was removed. Existing-channel onboarding now covers UI language and theme; channel connection remains only when no channel exists.
- **Landing / shared shell:** responsive header, footer and legal links/pages added and visually polished.
- **Cross-app:** control sizing, focus-visible states, spacing and responsive containment were normalized without changing backend/API/database/OAuth or enabling YouTube writes.

## QA state

- User visually reviewed the current desktop flow during the A1–A11 pass and reported the latest layouts looking good, with targeted issues repaired iteratively.
- GitHub Actions passed on the immediately preceding UI commit `1d0e494` (API pytest, frontend Node tests, lint and production build via the PR workflow).
- Final label fix commit `8f4b67d` changes only the Statistics publication-date sort label from a missing key to the existing localized `videoPublishedAt` key; its CI run was queued when this handoff was updated.
- PR #1 remains **draft** and unmerged.
- Final local responsive/browser smoke is still required at 1440 / 1024 / 390 before merge because this environment cannot drive the user's localhost/browser.
- Known non-blocking historical issue: favicon 404.
- Branch currently diverges from `main`: the UI branch is ahead while `main` also contains later CI-history commits. Reconcile/update the PR branch before merge rather than assuming a clean fast-forward.

## Final code QA — 2026-10-04

- Latest branch head `762f8da` passed GitHub Actions CI run #35: API pytest, frontend Node tests, lint and production build.
- PR #1 is mergeable but the branch is 2 commits behind `main`; those two `main` commits only carry the CI invocation fix already present on this branch. Prefer squash-merge PR #1 rather than trying to fast-forward 50 UI commits.
- Code audit found no merge-blocking defect in the current read-only scope.
- Follow-up architecture debt before enabling write/AI features:
  - `studio.js`, `globals.css`, `i18n.js` and this handoff file are now large monoliths; split by feature before Write Mode grows.
  - Quota UI is presentation-only today; real YouTube quota accounting must live server-side and distinguish estimated API cost from Google's project-wide authoritative quota.
  - AI provider/API-key controls are placeholders only; future secrets must be stored server-side encrypted and never persisted in browser preferences.
  - Channel language is intentionally a browser preference keyed by stable YouTube channel ID; if it must follow a user across devices, move it to backend persistence.
  - Google connections with zero managed channels are hidden in Cabinet rather than deleted. A future connection-management flow should explicitly support disconnect/revoke and cleanup.
  - Legal pages are English placeholder product copy and require proper legal/localization review before public launch.
- No YouTube write operation is enabled. Treat the next phase as a separate backend/API/security design effort, not as wiring the disabled buttons directly to YouTube.

## Product boundaries

- Read-only YouTube behavior is preserved. Write Mode remains a disabled future placeholder.
- No backend API, database, Alembic, OAuth, ownership, or YouTube write behavior was changed by this UI batch.
- Do not merge PR #1 until final CI and local responsive smoke are green.

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


## Запись 2026-10-04 — pre-merge hardening Write Mode и local playlists

- Quota telemetry изолирована от request/domain transaction: YouTube quota attempts теперь записываются отдельной SQLAlchemy Session и не могут своим `commit()` случайно закоммитить pending domain changes текущего запроса.
- Аудит YouTube Data API вызовов: Data API reads/writes в `app/youtube.py` проходят через централизованный `_execute` и quota recorder; YouTube Analytics остаётся отдельным API и не включается в Data API ledger.
- Текущая granular quota-модель повторно сверена с официальной документацией YouTube на 2026-10-04. Добавлены известные costs для будущих captions/channel/video-delete write paths; это только accounting constants, новые destructive endpoints не включены.
- `GET/PUT /write-mode` теперь правдиво возвращает `youtube_writes_available: true`, поскольку W4 metadata publish уже реализован. Confirmation copy обновлён: Write Mode разрешает поддерживаемые write operations, но сам по себе ничего не отправляет.
- W4 metadata publish сериализуется row lock по выбранному Video перед revision check, чтобы два параллельных запроса не отправили одну и ту же working revision дважды. Frontend дополнительно уже блокирует повторный submit через `workingSaving`.
- Local playlist drafts теперь серверно персистентны через migration `0009_local_playlist_drafts`: create/list/membership/delete owner-scoped, mutations same-origin, reload браузера не должен терять draft/membership.
- Добавлены backend tests для local playlist persistence, same-origin и cross-user ownership; migration test проверяет наличие `local_playlists`.
- Исправлена локализация playlist removal: en/ru/uk keys снова находятся в своих языковых секциях, без duplicate-key override.
- Реальные YouTube playlist mutations, thumbnail upload, captions upload и destructive video delete в этом hardening-проходе намеренно не включались. Их нужно делать отдельными write increments после merge текущей ветки.

## Запись 2026-10-05 — AI connections и Cabinet polish

- Добавлена migration `0011_ai_connections`: пользовательские AI connections хранят provider/model, зашифрованный API key и отдельные prompts для улучшения title/description. Уникальность — на `(user_id, provider, model)`.
- Backend реализует owner-scoped `GET /ai-connections` и same-origin `PUT /ai-connections`. Plaintext API key не возвращается: клиент получает только `has_api_key`; новый/заменённый ключ шифруется тем же server-side encryption boundary. Реальных вызовов OpenAI/Gemini/Anthropic и AI Improve actions пока нет.
- Cabinet → Account теперь редактирует provider/model/API key и prompts. Сохранённый ключ отображается только как masked state; пустое поле при повторном сохранении не заменяет существующий ключ.
- Полировка Cabinet: кнопка отмены полностью локализована через общий `actionCancel`; отмена/повторное закрытие настроек восстанавливает сохранённые prompts, очищает transient notice/error и не сохраняет изменения. Текст AI-блока приведён в соответствие фактической server-side encrypted persistence.
- Ветка реализации: `feature-ai-connections`. Документация ниже/выше может содержать исторические записи этапов; эта запись является актуализацией фактического состояния AI connections на 2026-10-05.

### Ограничения / следующий шаг

- AI provider calls всё ещё отключены; наличие connection не означает, что MoyaStudia отправляет данные внешнему AI provider.
- Добавлены backend tests для AI authentication, owner scope, same-origin write protection, encrypted-at-rest API key, отсутствия plaintext key в API responses, сохранения существующего ключа при обновлении prompts и обязательного ключа для новой connection. Frontend node:test дополнен проверкой локализации AI labels/cancel для en/ru/uk.
- UI-level автоматизация cancel/dirty/validation без React/browser test harness пока не добавлялась: существующий frontend test stack покрывает pure helpers/i18n, а новая test dependency в этот scope не вводилась.
- Контрольная проверка 2026-10-05 после AI/Cabinet polish: backend `pytest` — **130 passed**; frontend `node --test tests/studio-catalog.test.mjs` — **31 passed, 0 failed**; `npm run lint` — без ошибок (только существующие warnings); `npm run build` — успешно, все 7 static pages сгенерированы. Неблокирующие warnings: FastAPI `on_event`/Starlette deprecations, Node module-type warning, существующие Next.js `<img>`/font warnings и autoprefixer `end` compatibility warning.
- Финальный pre-merge audit обнаружил и исправил server-side whitespace validation gap: модель из одних пробелов и новый API key из одних пробелов теперь отклоняются с 422; добавлен regression test. Cabinet Cancel также очищает введённый, но не сохранённый API key из browser state. После этих последних правок полный validation suite требуется повторить перед merge.
- `HOWTOSTART.md` должен считать `0011_ai_connections` текущим migration head после merge этой ветки.


## Запись 2026-10-06 — финальная полировка интерфейса и pre-merge validation

- Последовательно приняты и визуально проверены финальные состояния Video, Playlists, Calendar и Statistics на ветке `feature-statistics-v3`.
- Video: одиночный статус добавлен как staged control в настройки видео; изменение участвует в общем индикаторе несохранённых изменений и Cancel, но фактическая отправка нового статуса на YouTube пока намеренно не подключена. Добавлены локализованные hover-подсказки EN/RU/UK для редактируемых metadata/status и conflict actions.
- Cabinet: язык канала переведён из хрупкой browser-only preference в постоянное поле `Channel.working_language`. Migration `0012_channel_working_language` применена к локальной PostgreSQL; `/channels` возвращает значение, owner-scoped same-origin PUT сохраняет его. Старое localStorage-значение автоматически мигрируется один раз.
- Statistics: раскрытый список каналов ограничен шириной первого control вместо растягивания на всю рабочую область.
- Localization parity: `npm run check:i18n` — **630 keys in EN/RU/UK**, parity OK.
- Backend validation после migration 0012: полный `pytest -q` — **134 passed** (по progress output: 112 + 22), 0 failed. Остались только существующие deprecation warnings Starlette/FastAPI (`BlockingPortal`, `on_event`/lifespan).
- Frontend `npm run lint` — **0 errors**; остаются неблокирующие существующие Next.js warnings по `<img>`, custom font и deprecated `next lint`.
- Frontend `npm run build` — **успешно**, lint/type check пройдены, static pages **7/7**, production build завершён.
- Два build warnings Autoprefixer по `align-items: end` после основного прогона точечно исправлены на эквивалентный `flex-end`; визуальная геометрия не менялась. Повторный frontend validation после этой правки: `npm run check:i18n` — 630 keys EN/RU/UK, `npm run lint` — 0 errors, `npm run build` — успешно, 7/7 static pages; Autoprefixer warnings исчезли. Остались только известные неблокирующие Next.js `<img>`/custom-font и deprecated `next lint` warnings.
- Реальные YouTube write операции в этом validation-прогоне не выполнялись.
- **Superseded 2026-10-07:** этот старый merge-gate относился к предшествующему UI pass и больше не является текущим состоянием. Новый merge policy определён в `AUDIT_2026-10-07.md`.


## Запись 2026-10-07 — Phase 5 visual polish

- Перед визуальной полировкой зафиксирована точка отката `CHECKPOINT: pre visual polish baseline`.
- По совместному визуальному аудиту принята текущая геометрия Videos, Playlists, Calendar, Statistics и Cabinet: ширины колонок и основное позиционирование на этом этапе не меняются.
- Первый visual-polish pass усиливает контраст светлой темы, выравнивает мелкую типографику и вертикальный ритм без глобальной перестройки layout.
- Videos: левая колонка разгружена — внутренний признак availability больше не дублируется в строке видео; статус и семантически подписанная дата разнесены по читаемым строкам. Неоднозначный availability также убран из summary, где рядом с privacy/status мог восприниматься как публичная доступность.
- Playlists: даты видео теперь явно подписываются как дата планирования / публикации / YouTube-дата с использованием уже существующей семантики каталога.
- Cabinet: технические Google/YouTube identities вида `@pages...` больше не показываются как основной пользовательский email; для них используется название связанного канала, а исходный technical identity остаётся в title/tooltip.
- Calendar и Statistics сохраняют принятую геометрию и функциональные периоды Statistics `7 / 28 / 90 / Всё время`.
- Следующий gate: CI + локальная визуальная проверка light/dark перед дальнейшим распространением polish-настроек.
