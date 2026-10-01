# MoyaStudia

SaaS для управления YouTube-контентом. MoyaStudia не является видеохранилищем и не заменяет видеоредактор. Цель продукта — перенести рабочие операции автора из YouTube Studio в единый кабинет.

Пользователь подключает свой Google-аккаунт и свои YouTube-каналы. Видео остаются на YouTube; MoyaStudia хранит только необходимые метаданные и настройки, поэтому большие видеофайлы не нужно переносить в наше хранилище.

Текущая реализация включает Foundation, channel discovery/selection (Stage 2A/2B) и read-only video catalog/sync (Stage 3). Google OAuth — единственный реализованный identity flow; Apple login и YouTube write operations не включены. Актуальное состояние и ограничения перечислены в [STATUS.md](STATUS.md).

## Что умеем сегодня

- Лендинг → вход через Google → онбординг языка/темы. Сервер проверяет аутентификацию; браузер хранит только настройки интерфейса.
- Подключение YouTube — отдельный OAuth flow; refresh token зашифрован при хранении.
- Доступные YouTube-каналы обнаруживаются через подключённый Google account; в MoyaStudia сохраняются только выбранные каналы.
- Studio читает видео из локального cache; initial import и sync запускаются явно.
- Тема светлая/тёмная/авто, язык интерфейса en/ru/uk отдельно от языка канала.
- Read-only работа строится на реальных данных YouTube, а не на mock-каталоге.

## Что пока намеренно не включено

- Загрузка больших видеофайлов в MoyaStudia.
- Запись метаданных, плейлистов, обложек и расписания в YouTube.
- Биллинг и публичный SaaS multi-tenancy.
- AI-провайдеры и генерация контента — вне архитектуры MoyaStudia.

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

Проверки: из `apps/api` — `python -m pytest`; из `apps/web` — `node --test tests/studio-catalog.test.mjs`, `npm run lint`, `npm run build`.

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
- `GET /channels` and channel data routes require a server session and owner match
- `GET /google-connections/{connection_id}/available-channels`
- `POST /google-connections/{connection_id}/channels`
- `POST /channels/{id}/refresh-profile`
- `DELETE /channels/{id}` (пока отвечает 409; disconnect ещё не реализован)
- `GET /channels/{id}/videos`
- `GET /channels/{id}/catalog/status`
- `POST /channels/{id}/catalog/sync`
- `POST /channels/{id}/catalog/sync/continue`
- `GET /channels/{id}/playlists`

`apps/api/app/youtube.py` — Google/YouTube OAuth и API. `apps/api/app/main.py` — HTTP routes и ownership checks. `apps/api/app/tokens.py` — шифрование токенов. Не копировать `main.py` поверх `youtube.py`.

## Соглашения для следующей модели

- Кабинет = настройки профиля, каналов, интерфейса. Студия = рабочая область роликов.
- Язык UI ≠ язык канала.
- Не писать на YouTube без отдельной кнопки и без показа квоты.
- Не складывать костыли в конец `globals.css`. Менять исходное правило.
- Патчи пользователю — дельта изменённых файлов, не весь монорепо.
- Windows / PowerShell, кириллица в ответах.

Подробный статус: `STATUS.md`. Запуск с нуля: `HOWTOSTART.md`.
