# MoyaStudia — Current Status

Snapshot: 2026-10-01. This is the current implementation handoff; architecture and product roadmap details live in [MoyaStudia_ARCHITECTURE.md](MoyaStudia_ARCHITECTURE.md).

## Project purpose

MoyaStudia is a SaaS workspace for managing YouTube channels and content. YouTube remains the source of truth for published state and media files. The product can now store local working title/description/tags for catalog videos; it still does not write content to YouTube or store video files.

## Current stage

Foundation, Stage 2A/2B channel discovery/selection, Stage 3 read-only video catalog/sync, and Stage 4 local working metadata increment are in progress. Backend schema/API/reconcile protection are implemented; Studio editor integration is in progress. No YouTube write-back is implemented.

## Current git baseline

Implementation baseline before Stage 4: `e4c1356` (`Harden playlist scope and ownership regression tests`), on `main`. The temporary root file `промпт.txt` is modified in the working tree; do not stage, rewrite, or restore it.

## Actual architecture

- `apps/web`: Next.js 15.5.27 App Router, React 19.3.0. `app/` contains landing, onboarding, Cabinet, Studio and shared UI; `lib/` contains API/preferences/localization/catalog helpers.
- `apps/api`: FastAPI, SQLAlchemy and Google OAuth/YouTube client. `app/main.py` owns routes and authorization; `app/youtube.py` owns Google/YouTube API calls; `security.py` owns sessions/OAuth state; `tokens.py` encrypts refresh tokens.
- `apps/api/migrations/versions`: Alembic revisions `0001_foundation` and `0002_video_catalog`; Stage 4 migration is pending.
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

- Google identity login/logout, server-side sessions and browser-bound OAuth state.
- Encrypted Google/YouTube refresh-token storage and owner-scoped API access.
- Google connection reuse, paginated channel discovery and explicit channel selection.
- Read-only video cache, catalog status, DB pagination/filtering, initial/incremental/reconcile sync and LOADING resume.
- Stage 4 backend local overrides/bases/revision for title/description/tags, owner-scoped video detail/PATCH, and reconcile protection for local work.
- Local title/description/tags overrides for existing catalog videos, base snapshot tracking, revision-checked save and reconcile retention for locally edited remote-missing videos.
- Studio catalog/calendar cache views, onboarding, Cabinet settings and en/ru/uk UI localization.
- Alembic-managed schema and PR CI for backend/frontend checks.

## What is not implemented

- Apple OAuth/login; channel disconnect/revoke/reconnect retention and automatic data cleanup.
- YouTube write operations: video upload/edit/publish/schedule, metadata/branding mutation or playlist mutation.
- Playlist membership synchronization/cache; the playlist API currently returns only playlist ID/title.
- Local working edit state for catalog Video is in progress; draft lifecycle/TTL, readiness rules, templates, media storage, comments, analytics, billing, teams/roles remain unimplemented.
- Background workers, continuous polling, and permanent video/media-file storage.

## Known technical issues

- `DELETE /channels/{id}` is a placeholder that returns 409; the planned connection lifecycle is unfinished.
- Playlist listing is channel-scoped in the current worktree and returns only ID/title; it is not a playlist membership cache. Studio fields beyond those returned may be empty.
- `0001_foundation` drops pre-existing prototype `channels` and `videos` tables without migrating their data. Use a fresh/verified database and backup before applying migrations to any existing database.
- `next lint` is deprecated for Next.js 16; current lint/build report existing `<img>` and custom-font warnings. Backend tests report FastAPI/Starlette deprecation warnings.
- Production Google OAuth, real YouTube quota behavior, and migration deployment against the configured production PostgreSQL database have not been verified.

## Tests / verification

Verified on 2026-10-01:

- Backend: `apps/api/.venv/Scripts/python.exe -m pytest` from `apps/api` — **38 passed** (3 deprecation warnings) after security/playlist hardening; Stage 4 tests pending.
- Frontend catalog: `node --test tests/studio-catalog.test.mjs` from `apps/web` — **5 passed**.
- `npm run lint` from `apps/web` — passed with the warnings listed above.
- `npm run build` from `apps/web` — passed with the same existing frontend warnings.
- `git diff --check` — passed.

Migration tests use SQLite fixtures; these results do not establish that a production migration was applied. OAuth and live YouTube API/quota were not exercised.

## Current limitations

The application is read-only with respect to YouTube. Full Cabinet/Studio flows require a reachable PostgreSQL database, Google OAuth configuration and an authorized test user. Without OAuth, only anonymous frontend/health checks are available. The documented database target is PostgreSQL/Neon; the actual local `DATABASE_URL` was not inspected as it is secret configuration.

## Next development steps

1. Complete the Stage 4 first increment: local title/description/tags overrides, base snapshot/revision, owner-scoped detail/PATCH, Studio local save, and reconcile protection for dirty remote-missing videos. No YouTube writes.
2. Decide later whether to implement channel disconnect/revoke/reconnect retention and playlist membership caching.
3. Before production rollout, validate Alembic upgrade on a disposable PostgreSQL database and perform a real OAuth/YouTube smoke test without exposing credentials.

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
Web: `D:\GITHUB\moyastudia\apps\web`, Next 14.2.15.  
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

## Stage 4 status — first increment in progress

- Current milestone: Stage 4 backend schema, detail/PATCH API, reconcile protection and backend tests are implemented in the worktree. Studio editor integration is in progress. No Stage 4 changes are committed yet.
- Working semantics implemented in schema: nullable `title`, `description`, `tags` are local overrides; `NULL` inherits the YouTube snapshot and `""` is an explicit local clear. Per-field base snapshot columns and monotonically increasing `working_revision` are present.
- Reconcile requirement: after a complete successful scan, retain videos with local work and mark them remote-missing; rows without local work keep existing deletion behavior. Partial/failed reconcile remains non-destructive.
- Migration/API: `0003_video_working_state` adds nullable overrides, base values and revision; `GET /channels/{channel_id}/videos/{video_id}` and `PATCH /channels/{channel_id}/videos/{video_id}/working` are owner-scoped. Revision mismatch returns 409 with current state. Migration upgrade/downgrade is covered on SQLite; it has not been applied to real PostgreSQL.
- Successful full reconcile preserves any video with a non-NULL local override and marks it `remote_missing`; clean absent catalog rows retain deletion behavior.
- Implemented fields: title, description and tags only. PATCH does not accept snapshot or any other fields. No YouTube write-back, drafts, playlist mutations or other editable fields.
- Backend increment files: `apps/api/app/models.py`, `apps/api/app/main.py`, `apps/api/migrations/versions/0003_video_working_state.py`, `apps/api/tests/test_auth.py`, `apps/api/tests/test_catalog.py`, `apps/api/tests/test_migrations.py`.
- Backend verification: pytest **43 passed** (3 deprecation warnings), including migration upgrade/downgrade, ownership, snapshot, revision, sync-conflict and reconcile-retention tests.
- Frontend work in progress: `apps/web/app/studio.js`, `apps/web/app/globals.css`, `apps/web/lib/catalog-state.mjs`, `apps/web/lib/i18n.js`, `apps/web/tests/studio-catalog.test.mjs`.
- Last frontend tests: catalog tests **9 passed**. Lint/build passed before the latest helper/style changes and must be rerun before completion.
- Latest implementation commit: hardening commit `e4c1356`; Stage 4 changes are uncommitted.
- Exact next task: commit the verified backend increment separately, finish Studio local save/snapshot/status UI, then run all required suites and commit the frontend/tests/status checkpoint separately.
