# MoyaStudia

Кабинет выпуска для своих YouTube-каналов: карточки, сетка, запись метаданных.
Ролики на канал не заливаем — берём уже лежащие PRIVATE / unlisted.

## Структура

- `apps/api` — FastAPI (OAuth канала, карточки, YouTube)
- `apps/web` — кабинет (Next.js)

## Первый запуск у себя

Нужны: Python 3.11+, Node.js 20+, Git.

### 1. Секреты

Скопируйте примеры и заполните (файлы `.env` в git не попадают):

```
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

В `apps/api/.env` вставьте строку Neon и Google Client ID / Secret.

### 2. API

```
cd apps\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Проверка: в браузере http://localhost:8000/health  
Должно быть `{"ok": true, "db": true}`.

### 3. Кабинет

Новый терминал:

```
cd apps\web
npm install
npm run dev
```

Откройте http://localhost:3000

## Пока не делаем

Vercel подключим отдельным шагом, когда кабинет откроется локально.
