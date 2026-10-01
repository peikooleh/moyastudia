# Статус MoyaStudia

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
