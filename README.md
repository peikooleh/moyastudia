# MoyaStudia

SaaS для управления YouTube-контентом. MoyaStudia не является видеохранилищем и не заменяет видеоредактор. Цель продукта — перенести рабочие операции автора из YouTube Studio в единый кабинет.

Пользователь подключает свой Google-аккаунт и свои YouTube-каналы. Видео остаются на YouTube; MoyaStudia хранит только необходимые метаданные и настройки, поэтому большие видеофайлы не нужно переносить в наше хранилище.

Текущая фаза — Foundation (Stage 1): Google identity MoyaStudia, серверная cookie-сессия, проверка OAuth state, зашифрованные YouTube refresh tokens, PostgreSQL-модель с ownership, тесты и CI. Модель identity поддерживает Apple, его OAuth flow подключается позже. Поиск каналов и синхронизация каталога относятся к будущим этапам. Запись в YouTube не включена.

## Что умеем сегодня

- Лендинг → вход через Google → онбординг языка/темы. Сервер проверяет аутентификацию; браузер хранит только настройки интерфейса.
- Подключение YouTube — отдельный OAuth flow; refresh token зашифрован при хранении.
- Поиск каналов, синхронизация каталога видео и доступ к данным студии не входят в Stage 1.
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
| `apps/web` | Next.js 14 App Router | кабинет и студия |
| `apps/api` | FastAPI + SQLAlchemy | OAuth, YouTube, Postgres |
| БД | Neon Postgres | каналы, refresh-токены |
| Google | отдельный Cloud-проект, OAuth Web, YouTube Data API v3 | не смешивать с десктоп-студией |

Монорепозиторий без общего package.json. API и web поднимаются отдельно.

## Foundation data model

- **Identity** — провайдер и стабильный provider subject. Сначала работает Google; схема также поддерживает Apple. Совпадение email не объединяет identity автоматически.
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
- `POST /channels/{id}/refresh-profile`
- `DELETE /channels/{id}`
- `GET /channels/{id}/videos`
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
