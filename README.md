# MoyaStudia

SaaS для управления YouTube-контентом. MoyaStudia не является видеохранилищем и не заменяет видеоредактор. Цель продукта — перенести рабочие операции автора из YouTube Studio в единый кабинет.

Пользователь подключает свой Google-аккаунт и свои YouTube-каналы. Видео остаются на YouTube; MoyaStudia хранит только необходимые метаданные и настройки, поэтому большие видеофайлы не нужно переносить в наше хранилище.

Текущая реализация уже вышла за пределы раннего read-only Stage 3: есть server-authoritative Write Mode, локальный working state видео, контролируемая отправка поддерживаемых изменений в YouTube, playlist/calendar write increments, quota telemetry и серверные AI connection settings. Google OAuth остаётся единственным реализованным identity flow; Apple login не реализован. AI metadata provider calls уже доступны server-side для OpenAI, Gemini, Anthropic, xAI и Groq. Актуальное состояние и ограничения перечислены в [STATUS.md](STATUS.md); принципы write security зафиксированы в [WRITE_MODE_DESIGN.md](WRITE_MODE_DESIGN.md).

## Аудит 2026-10-07

Полный повторный аудит текущего `main` и план устранения найденных проблем зафиксированы в [AUDIT_2026-10-07.md](AUDIT_2026-10-07.md). Рабочая ветка remediation — `audit-remediation-2026-10-07`; изменения должны применяться поэтапно, с тестами и документацией в тех же коммитах.

## Что умеем сегодня

- Лендинг → вход через Google → онбординг языка/темы. Сервер проверяет аутентификацию; браузер хранит только настройки интерфейса.
- Подключение YouTube — отдельный OAuth flow; refresh token зашифрован при хранении.
- Доступные YouTube-каналы обнаруживаются через подключённый Google account; в MoyaStudia сохраняются только выбранные каналы.
- Studio читает видео из локального cache; initial import и sync запускаются явно.
- Тема светлая/тёмная/авто, язык интерфейса en/ru/uk отдельно от языка канала.
- Каталог и рабочие операции строятся на реальных данных YouTube, а не на mock-каталоге.
- Локальные working-изменения отделены от YouTube snapshot; поддерживаемые remote writes требуют включённого серверного Write Mode и явного действия пользователя.
- MoyaStudia ведёт собственный server-side ledger обращений к YouTube Data API и показывает отслеживаемое использование квоты.
- В Cabinet можно сохранить per-user AI provider/model/API-key settings; API key хранится зашифрованным и не возвращается в plaintext. Для видео есть два независимых пользовательских набора промптов: обычные видео и Shorts; в каждом отдельно настраиваются название, описание и теги. Наборы общие для всех сохранённых AI-моделей пользователя и переключаются табами в Cabinet. При AI Improve backend использует официальный YouTube Analytics `creatorContentType` (`videoOnDemand` / `shorts`), кэширует результат в видео и выбирает соответствующий набор без эвристик по длительности, геометрии, названию или `#shorts`. Для playlist/channel сохраняется прежняя маршрутизация по общим long-form prompt preferences. Каждое действие «Улучшить» позволяет выбрать одно из реально подключённых AI-соединений; выбор сохраняется между Studio и Cabinet.

## Что пока намеренно не включено

- Хранение больших исходных видеофайлов и полноценный video upload pipeline.
- Полный набор операций YouTube Studio: доступны только явно реализованные write flows; destructive удаление YouTube video/channel не реализовано.
- Полноценный Google revoke/disconnect lifecycle.
- Биллинг и публичный SaaS multi-tenancy.
- AI suggestions изменяют только локальный draft/редактор. Даже подключённая AI-модель не получает права напрямую записывать изменения в YouTube; публикация остаётся отдельным явным действием пользователя под Write Mode.

## Стек

| Слой | Выбор | Зачем |
|---|---|---|
| `apps/web` | Next.js 15.5.27 App Router, React 19.3.0 | кабинет и студия |
| `apps/api` | FastAPI + SQLAlchemy | OAuth, YouTube, Postgres |
| БД | Neon Postgres | каналы, refresh-токены |
| Google | отдельный Cloud-проект, OAuth Web, YouTube Data API v3 | не смешивать с десктоп-студией |

Монорепозиторий без общего package.json. API и web поднимаются отдельно.

## Быстрый запуск

Нужны Python 3.12, Node.js 20+ и доступная PostgreSQL database. Скопируйте `apps/api/.env.example` в `apps/api/.env`, задайте `DATABASE_URL` и, для OAuth/YouTube flows, Google OAuth client ID/secret и Fernet `TOKEN_ENCRYPTION_KEY`. Скопируйте `apps/web/.env.example` в `apps/web/.env.local`; `NEXT_PUBLIC_API_URL` по умолчанию указывает на `http://localhost:8000`.

В `apps/api` создайте и активируйте virtualenv, установите `requirements.txt`, затем выполните `alembic upgrade head`. API запускается командой `python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`. В отдельном терминале из `apps/web` выполните `npm ci` и `npm run dev`.

Подробные команды и OAuth setup приведены в [HOWTOSTART.md](HOWTOSTART.md). Не применяйте начальные миграции к базе с prototype `channels`/`videos`, пока не проверено сохранение её данных: `0001_foundation` удаляет эти старые таблицы.

Проверки: из `apps/api` — `python -m pytest`; из `apps/web` — `node --test tests/studio-catalog.test.mjs`, `npm run check:i18n`, `npm run lint`, `npm run build`.

## Foundation data model

- **Identity** — провайдер и стабильный provider subject. Работает Google; Apple login не реализован. Совпадение email не объединяет identity автоматически.
- **Session** — случайное непрозрачное значение в HttpOnly cookie; в PostgreSQL хранятся только его hash и срок действия. `localStorage` не используется для аутентификации.
- **Google connection** — отдельно от identity продукта; зашифрованный refresh token хранится в `google_connections`, ключ Fernet обязателен и поступает из environment/secret manager.
- **Каналы и видео** — принадлежат Google connection через явные foreign keys. Миграция Stage 1 удаляет prototype `channels`/`videos`; владельцы старых записей не угадываются.
- Схема обновляется через Alembic, а не при старте приложения.

Важные эндпоинты API:

- `GET /health`
- `GET /auth/google/login` → callback `GET /auth/google/callback`
- `GET /auth/session`; `POST /auth/logout`
- `GET /auth/youtube/login` → callback `GET /auth/youtube/callback`
- `GET /write-mode`; `PUT /write-mode` — server-authoritative Write Mode
- `GET /quota/today` — MoyaStudia-tracked YouTube Data API usage
- `GET /ai-connections`; `PUT /ai-connections`; `DELETE /ai-connections/{id}` — encrypted per-user AI settings и отдельные title/description/tags prompt preferences для обычных видео и Shorts
- `POST /ai/improve` — bounded AI metadata suggestion через явно выбранное `connection_id` (с backward-compatible latest-saved fallback); для video также принимает внутренний `video_id`, owner-scoped определяет/кэширует YouTube `creatorContentType` и маршрутизирует запрос в long-form или Shorts prompt set
- `GET /channels`, `POST /channels/{id}/refresh-profile`, `PUT /channels/{id}/working-language`, `PUT /channels/{id}/metadata`
- `DELETE /channels/{id}` — убрать managed channel из MoyaStudia; YouTube-канал не удаляется
- `GET /google-connections/{connection_id}/available-channels`; `POST /google-connections/{connection_id}/channels`
- Video catalog/working/write routes: `/channels/{id}/videos`, `.../working`, `.../publish-metadata`, `.../calendar-status`, `.../thumbnail`, `.../captions`
- Catalog sync: `GET .../catalog/status`, `POST .../catalog/sync`, `POST .../catalog/sync/continue`
- Statistics: `GET /channels/{id}/analytics/summary`
- Remote playlists: list/items plus metadata, thumbnail, add-video, reorder/position and remove-item write routes
- Local playlist drafts: list/create/membership/delete under `/channels/{id}/local-playlists`

`apps/api/app/youtube.py` — Google/YouTube OAuth и API. `apps/api/app/main.py` — HTTP routes и ownership checks. `apps/api/app/tokens.py` — шифрование токенов. Не копировать `main.py` поверх `youtube.py`.

## Соглашения для следующей модели

- Кабинет = настройки профиля, каналов, интерфейса. Студия = рабочая область роликов.
- Язык UI ≠ язык канала.
- Не писать на YouTube без отдельной кнопки и без показа квоты.
- Не складывать костыли в конец `globals.css`. Менять исходное правило.
- Патчи пользователю — дельта изменённых файлов, не весь монорепо.
- Windows / PowerShell, кириллица в ответах.

Подробный статус: `STATUS.md`. Запуск с нуля: `HOWTOSTART.md`.
