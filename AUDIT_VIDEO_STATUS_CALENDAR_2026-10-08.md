## Полный кодовый аудит «По ссылке» — 2026-10-10

**Наблюдение:** после выбора украинского канала YouTube Studio показывает 7 unlisted, а MoyaStudia — 2. Смена источника discovery на `search.list(forMine=true, channelId=...)` не устранила реальное расхождение. Не объявлять проблему исправленной на основании mock-тестов.

### Прослежена вся цепочка

1. **OAuth/канал:** `_channel_or_404` выбирает managed Channel, его `youtube_channel_id` и связанную GoogleConnection с зашифрованным refresh token. До сих пор нет живого доказательства, что этот OAuth владеет именно выбранным YouTube channel ID.
2. **Discovery:** `yt.list_videos` использует `search.list(forMine=true, channelId=<selected>, type=video)`, проходит все `nextPageToken`, отбрасывает результаты с чужим или отсутствующим `snippet.channelId`. Исторически `uploads playlist` возвращал неполные уникальные ID. Новая комбинация `forMine + channelId` проверена по официальной спецификации как допустимая, но полнота реального результата не проверена.
3. **Details:** `videos.list(part=snippet,status,...,id=...)` возвращает фактический `status.privacyStatus`. Код дополнительно отбрасывает детали, если `snippet.channelId != selected`. Отсутствующий ID получает локальный `availability_status=unavailable`.
4. **Синхронизация:** `continue_catalog_sync` проходит все страницы даже в incremental, сохраняет `youtube_visibility`, `youtube_scheduled_at` и `availability_status`; reconcile помечает/удаляет отсутствующие в discovery записи. Сбой страницы ставит `STALE/ERROR`, а не завершает успешную сверку. Путь полностью покрыт mock-тестами, но они не доказывают полноту YouTube.
5. **PostgreSQL/API:** `GET /channels/{id}/videos?visibility=unlisted` фильтрует `availability_status=available` и `youtube_visibility=unlisted`. Глобальные `status_counts` группируют записи SQL CASE; `youtube_scheduled_at IS NOT NULL` имеет приоритет над `unlisted`, поэтому наличие старого publishAt меняет категорию счётчика. `status_counts` считаются по всем видео канала, не только по текущей странице.
6. **Frontend:** `catalogVideosUrl` передаёт `visibility=unlisted` без переименования; список выводит все `data.items` и `next_cursor`, статистика использует `data.status_counts.unlisted` напрямую. Локального дополнительного фильтра, способного скрыть пять записей, нет. Календарь сейчас не меняем.

**Вывод из исходного кода:** UI не является источником потери пяти записей. Они либо отсутствуют в discovery, либо отбрасываются на details, либо уже в DB имеют другое значение `visibility`/`availability`/`publishAt`, либо текущий runtime не соответствует последнему коду. Какой именно вариант верен, невозможно доказать без фактического ответа YouTube и строк PostgreSQL.

### Инструмент для получения доказательства

Добавлен **только для чтения** `GET /channels/{id}/catalog/audit`:
- проверяет `channels.list(mine=true)` и выбранный channel ID;
- независимо собирает все страницы `search.list(forMine=true, channelId=...)`, `search.list(forMine=true)` с локальным фильтром channel ID, `playlistItems.list(uploads)`;
- для объединения ID этих источников и локального каталога делает прямой `videos.list(part=snippet,status)`;
- возвращает списки ID на каждом этапе, отфильтрованные чужие каналы, реальные unlisted ID и несоответствия с локальным кешем;
- поддерживает `?probe_ids=<11-char-video-id>,...` (до 20), чтобы проверить конкретные ID из YouTube Studio, даже если ни один discovery не обнаружил их;
- не запускает синхронизацию, не меняет записи каталога и ничего не отправляет на YouTube; расходы квоты учитываются. Каждый discovery ограничен десятью страницами (до 500), признак `truncated` указывает неполный результат.

**Для окончательного диагноза:** запустить endpoint в реальном локальном backend после pull/restart, сохранить JSON; сравнить `local.unlistedCount`, `remote.unlistedCount`, `sources.*.unlistedIds`, `mismatches`, `channel.oauthOwnsSelectedChannel`. Если и прямые детали не находят 7, добавить пять отсутствующих video ID в `probe_ids`. Не изменять production sync logic без этого результата.


# Аудит достоверности статусов и календаря — 2026-10-08

## Исходные расхождения (пользовательская проверка)

- YouTube Studio показывает запланированные публикации на ближайшие недели, но календарь MoyaStudia имеет пустые дни и иногда показывает неправильные даты.
- YouTube Studio показывает **7** видео «По ссылке» (unlisted), MoyaStudia показывает **2**.
- Аналогичный дефект отсутствующих scheduled-видео уже наблюдался 2026-10-05 (в YouTube Studio были публикации 6–9 октября, отсутствовавшие в локальном каталоге).
- Ранее опубликованное, затем переведённое в private видео сохраняет дату предыдущей публикации; её нельзя считать новым расписанием.
- Эти расхождения не считаются устранёнными. Без авторизованной сверки фактических YouTube IDs нельзя подтвердить первопричину каждого отсутствующего видео.

## Подтверждено исходным кодом

1. `yt.list_videos` перечисляет uploads playlist через `playlistItems.list`, затем получает `videos.list(part=snippet,status,contentDetails,statistics)` по полученным IDs. Если `videos.list` не вернул ID, каталог помечает запись `unavailable`; при полной сверке записи вне перечисленного набора удаляются, если нет локальных working-полей. Нужно проверить полноту uploads playlist для авторизованного канала и не объявлять исчезновение видео без подтверждения.
2. `status.publishAt` считывается как `youtube_scheduled_at`, а `status.privacyStatus` — как `youtube_visibility`. Scheduled является производным статусом поверх private. Для `unlisted` требуется `privacyStatus=unlisted`, `publishAt` не определяет этот статус.
3. Календарь группирует события по `(v.slot || v.publishedAt).slice(0,10)`, тогда как элементы date/time и локальный день работают с локальной датой браузера. ISO UTC и локальная дата могут различаться на границе суток; это потенциальная причина смещения событий. Нужен единый timezone-aware day-key.
4. `/channels/{id}/videos` фильтрует даты по `coalesce(youtube_scheduled_at,youtube_published_at)`. Календарю необходима полная пагинация и покрытие видимого 42-дневного окна, а не предположение о 50 элементах.
5. В `main.py` sync mode `incremental` завершает проход при первом пересечении с существующими IDs. Это может оставлять изменения статуса/расписания старых видео устаревшими. Проверить порядок и обновление ранее загруженных записей.
6. `snippet.publishedAt` у владельца private-видео может означать дату загрузки, а не будущую публикацию; единственный авторитетный источник расписания — `status.publishAt` в `videos.list` для авторизованного владельца (см. официальную документацию YouTube Data API).

## Исправления в рабочей ветке — 2026-10-10

- **Подтверждённый дефект №1:** incremental sync завершался на первом совпадении с известным video ID. Теперь обычный refresh проходит **все страницы uploads** и повторно читает изменяемые `privacyStatus` и `publishAt` даже для старых видео. Reconcile по-прежнему отдельно обрабатывает исчезнувшие IDs.
- **Подтверждённый дефект №2:** calendar day grouping использовал `.slice(0, 10)` у ISO timestamp (UTC-день), хотя окно календаря и пользовательский интерфейс работают по локальному дню. Теперь события группируются по `calendarLocalDateKey` с использованием локального часового пояса браузера.
- **Регрессионные тесты:** старое видео на следующей странице меняет статус на `unlisted` и `publishAt`; отдельно проверяется публикация `2026-10-10T23:30:00Z` в `Europe/Zurich` (должна попасть на 11 октября).
- **Проверено по коду:** календарь загружает **все страницы** API для 42-дневного окна, а не только первые 50 элементов.
- **Ожидаемое поведение после установки исправления:** обновление каталога должно заново перечитать все 137 видео и привести фильтр «По ссылке» и будущие scheduled-слоты в соответствие с YouTube API.
- **Пока не подтверждено на реальном канале:** счётчик 7/7 unlisted, все scheduled даты и полнота owner-authorized YouTube uploads. Для этого нужен запуск обновления пользователем и read-only сверка. Не объявлять расхождение закрытым только на основании тестов.

## Следующие действия (без YouTube writes)

1. Добавить read-only диагностику для конкретного канала: список всех remote IDs, статус, `publishAt`, `publishedAt`, `uploadStatus`, доступность и список IDs, отсутствующих локально.
2. Сравнить числа `unlisted` (ожидается 7), `scheduled` и конкретные даты с YouTube Studio, различая timezone и исходные UTC timestamp.
3. Проверить авторизацию именно нужного канала и полноту обхода uploads playlist + всех страниц `videos.list`; отдельно проверить, что `videos.list` возвращает владельцу private/unlisted.
4. Исправить только подтверждённые источники расхождения; не заменять проблему декоративным отображением.
5. Добавить regression tests: UTC midnight/day boundary, 42-day calendar range, scheduled/private/unlisted counts, изменения статуса старых видео после incremental sync, incomplete remote discovery.
6. Повторить CI: backend pytest/pip-audit, frontend tests/i18n/lint/build и выполнить реальную read-only сверку с YouTube Studio.

## Ограничения

- Не выполнять YouTube write, не менять visibility/schedule в процессе диагностики.
- Исходная ветка `page-audit-refinement-2026-10-08` сохранена для отката; этот анализ выполняется только в `fix-youtube-status-calendar-2026-10-08`, созданной от merge `5143460`.
- Нет прямого доступа к локальной PostgreSQL и авторизованной YouTube API-сессии пользователя через GitHub connector. Для фактической remote-сверки потребуется доступ к работающему API/диагностический read-only отчёт.
