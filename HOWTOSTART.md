# Как запустить MoyaStudia локально

Windows, PowerShell. Два терминала: API на `:8000`, кабинет на `:3000`.

## Что должно быть установлено

- Python 3.12 (не 3.14 — с ним ломалась сборка драйвера Postgres).
- Node.js 20+.
- Git (если `git` не находится: `& "C:\Program Files\Git\cmd\git.exe"`).
- Проект Neon и Google Cloud (OAuth Web + YouTube Data API v3).
- В OAuth consent добавлен тестовый пользователь — тот же Gmail, которым логинитесь.

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
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/youtube/callback
APP_SECRET=любая-строка
FRONTEND_ORIGIN=http://localhost:3000
```

`apps\web\.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

В Google Cloud Authorized redirect URIs должен быть ровно `http://localhost:8000/auth/youtube/callback`.

## 2. База

Таблицы создаёт API при старте (`create_all` + `ALTER … IF NOT EXISTS`). Отдельно миграции гонять не нужно.

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
npm install
npm run dev
```

Открыть `http://localhost:3000`.

Не запускать `npm` из `D:\GITHUB\moyastudia\apps` — там нет `package.json`.

После смены CSS: Ctrl+F5. Next кэширует стили.

## 5. Подключить канал

1. Вход на лендинге.
2. Кабинет → Каналы → плитка «+» (это `GET /auth/youtube/login`).
3. Google → разрешение YouTube.
4. Возврат на `http://localhost:3000/?connected=1`.
5. Выбрать плитку канала. Карточка обновится через `POST /channels/{id}/refresh-profile`.

## Частые поломки

| Симптом | Что проверить |
|---|---|
| ERR_CONNECTION_REFUSED :8000 | uvicorn не запущен или запущен не из `apps\api` |
| ERR_CONNECTION_REFUSED :3000 | `npm run dev` не из `apps\web` |
| OAuth 403 access_denied | тестовый пользователь в Google Cloud |
| 502 `/videos` и `нет list_videos` | в `youtube.py` снова попал код `main.py` |
| 502 после рестарта API | refresh токена со scope; см. `creds_from_refresh` без `scopes=` |
| `pg_config not found` | ставить `psycopg[binary]`, не собирать `psycopg2` из исходников |
| Сайт без лого/баннера | перезапуск API + refresh-profile, не путать venv |

Остановка: Ctrl+C в каждом терминале.
