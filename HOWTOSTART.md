# Как запустить MoyaStudia локально

Windows, PowerShell. Два терминала: API на `:8000`, кабинет на `:3000`.

## Что должно быть установлено

- Python 3.12 (не 3.14 — с ним ломалась сборка драйвера Postgres).
- Node.js 20+.
- Git (если `git` не находится: `& "C:\Program Files\Git\cmd\git.exe"`).
- PostgreSQL database (документация проекта использует Neon) и Google Cloud OAuth Web / YouTube Data API v3 для реальных login/YouTube flows.
- В OAuth consent добавлен тестовый пользователь для Google identity и YouTube connection.

## 1. Секреты

```powershell
cd D:\GITHUB\moyastudia
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

`apps\api\.env`:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=....
GOOGLE_IDENTITY_REDIRECT_URI=http://localhost:8000/auth/google/callback
GOOGLE_YOUTUBE_REDIRECT_URI=http://localhost:8000/auth/youtube/callback
TOKEN_ENCRYPTION_KEY=<generated Fernet key>
APP_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
```

`apps\web\.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

После установки зависимостей в API venv сгенерируйте Fernet key командой `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` и сохраните его только в secret manager или локальном `apps\api\.env`. Не добавляйте ключ в репозиторий. В production используйте `APP_ENV=production` и HTTPS.

В Google Cloud Authorized redirect URIs должны быть зарегистрированы оба адреса: `http://localhost:8000/auth/google/callback` и `http://localhost:8000/auth/youtube/callback`.

## 2. База

Из `apps\api` примените все текущие migrations до `head`:

```powershell
alembic upgrade head

`head` now includes `0006_youtube_quota_usage` (server-side YouTube API usage ledger for `/quota/today`), `0007_user_write_mode` (server-authoritative Write Mode, default OFF), `0008_video_working_language` (local/base video language draft fields), and `0009_local_playlist_drafts` (persistent local playlist drafts and membership). Apply migrations before starting this branch; the application does not create these schema changes automatically.

For the Statistics watch-time card, enable **YouTube Analytics API** in the same Google Cloud project as the existing YouTube Data API credentials. The app queries `estimatedMinutesWatched` with the existing read-only YouTube connection; if Analytics is unavailable, the card stays empty rather than estimating watch time.
```

Важно: `0001_foundation` удаляет старые prototype-таблицы `channels` и `videos` без переноса записей. Используйте новую/проверенную базу и сделайте backup перед migration существующей базы. Schema далее управляется Alembic; API не меняет её при старте.

Проверка после запуска API: в `apps\api` при активном venv

```powershell
python check_db.py
```

Если файла нет — достаточно `GET http://127.0.0.1:8000/health` → `"db": true`.

## 3. API

Каждый раз из этой папки, не из корня репозитория.

```powershell
cd D:\GITHUB\moyastudia\apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Окно не закрывать. В логе: `Uvicorn running on http://127.0.0.1:8000`.

Проверка: браузер `http://127.0.0.1:8000/health`  
Ожидание: `{"ok":true,"db":true,"google_configured":true}`.

Если `uvicorn` «не распознано» — вы не в venv или вызвали команду без `python -m`.

## 4. Кабинет

Второе окно PowerShell:

```powershell
cd D:\GITHUB\moyastudia\apps\web
npm ci
npm run dev
```

Открыть `http://localhost:3000`.

Не запускать `npm` из `D:\GITHUB\moyastudia\apps` — там нет `package.json`.

После смены CSS: Ctrl+F5. Next кэширует стили.

## 5. Подключить канал и загрузить каталог

1. На лендинге войдите через Google. Это MoyaStudia identity и устанавливает серверную HttpOnly session cookie.
2. Подключите Google/YouTube account отдельным OAuth flow.
3. После callback откроется Cabinet. Загрузите список доступных каналов и сохраните только явно выбранные каналы.
4. Откройте Studio и нажмите загрузку каталога. Initial sync выполняется страницами; импорт можно продолжить после повторного открытия Studio.

## 6. Tests и build

Backend, из `apps\api` с активным virtualenv:

```powershell
python -m pytest
```

Frontend, из `apps\web`:

```powershell
node --test tests\studio-catalog.test.mjs
npm run lint
npm run build
```

## Частые поломки

| Симптом | Что проверить |
|---|---|
| ERR_CONNECTION_REFUSED :8000 | uvicorn не запущен или запущен не из `apps\api` |
| ERR_CONNECTION_REFUSED :3000 | `npm run dev` не из `apps\web` |
| OAuth 403 access_denied | тестовый пользователь в Google Cloud |
| 401 на API | войдите через Google; локальные preferences не являются сессией |
| Ошибка TOKEN_ENCRYPTION_KEY | задайте Fernet key в secret manager или локальном `.env` |
| Ошибка миграции | проверьте `DATABASE_URL`, затем запустите `alembic upgrade head` из `apps\api` |
| 502 на чтении YouTube | проверьте активность Google connection, read-only scope и доступность Google API |
| `pg_config not found` | ставить `psycopg[binary]`, не собирать `psycopg2` из исходников |
| Сайт без лого/баннера | перезапуск API + refresh-profile, не путать venv |

Остановка: Ctrl+C в каждом терминале.


### W4 YouTube write permission

W4 adds single-video metadata writes through `videos.update`. YouTube connections authorized before W4 only have the previous read permission, so reconnect/reauthorize the YouTube connection before testing the first write. The current OAuth request keeps `youtube.readonly` and adds `youtube.force-ssl`; no bulk or delete operation is exposed by MoyaStudia in W4.
