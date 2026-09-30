# MoyaStudia

SaaS для управления YouTube-контентом. MoyaStudia не является видеохранилищем и не заменяет видеоредактор. Цель продукта — перенести рабочие операции автора из YouTube Studio в единый кабинет.

Пользователь подключает свой Google-аккаунт и свои YouTube-каналы. Видео остаются на YouTube; MoyaStudia хранит только необходимые метаданные и настройки, поэтому большие видеофайлы не нужно переносить в наше хранилище.

Текущая фаза — архитектура и read-only интерфейс на реальных данных подключённых каналов. Запись в YouTube намеренно не включается, пока интерфейс и модель данных не будут утверждены.

## Что умеем сегодня

- Лендинг → вход → онбординг языка/темы → кабинет/студия.
- Кабинет: профиль, каналы, интерфейс.
- Несколько каналов на одном аккаунте. Выбор плитки, отвязка, язык контента канала (хранится у нас в браузере).
- Карточка выбранного канала: баннер, название, дата создания, ролики, подписчики, описание — с YouTube Data API, только чтение.
- Студия: список роликов канала (public / private / unlisted / scheduled), карточка полей, превью desktop/mobile. Поля read-only. Кнопка записи на YouTube ещё не живая.
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

## Как устроены данные

- **Сессия кабинета** — `localStorage` (`signedIn`, `uiLang`, `theme`, `selectedChannelId`, `channelLangs`, квоты-муляжи). Выход не стирает настройки, только `signedIn`.
- **Канал в Postgres** — `youtube_channel_id`, `title`, `refresh_token`, `thumbnail_url`, `banner_url`, `description`, `yt_published_at`, `subscriber_count`, владелец.
- **Ролики** в студии не кэшируем в БД на чтение: каждый раз `channels.list` + `playlistItems` uploads + `videos.list`.
- OAuth: `access_type=offline`, `prompt=consent`. Access token обновляется по `refresh_token` без повторной передачи нашего списка scope (иначе Google отвечает ошибкой и падают `/videos` и `/refresh-profile`).

Важные эндпоинты API:

- `GET /health`
- `GET /auth/youtube/login` → callback `GET /auth/youtube/callback`
- `GET /channels`
- `POST /channels/{id}/refresh-profile`
- `DELETE /channels/{id}`
- `GET /channels/{id}/videos`
- `GET /channels/{id}/playlists`

`apps/api/app/youtube.py` — только Google/YouTube. `apps/api/app/main.py` — HTTP. Не копировать `main.py` поверх `youtube.py`.

## Соглашения для следующей модели

- Кабинет = настройки профиля, каналов, интерфейса. Студия = рабочая область роликов.
- Язык UI ≠ язык канала.
- Не писать на YouTube без отдельной кнопки и без показа квоты.
- Не складывать костыли в конец `globals.css`. Менять исходное правило.
- Патчи пользователю — дельта изменённых файлов, не весь монорепо.
- Windows / PowerShell, кириллица в ответах.

Подробный статус: `STATUS.md`. Запуск с нуля: `КАК-ЗАПУСТИТЬ.md`.
