Архитектура SnowParty Arena (черновик)
======================================

Компоненты
----------
- Django + Channels (ASGI) — HTTP/REST + WebSocket.
- Redis — channel layer для широковещательной рассылки.
- React (Vite) — два фронта в одном SPA: `/tv` и `/play`.

Сущности (модели Django)
------------------------
- Session: `id`, `code`, `status` (pending/active/finished), `started_at`, `ended_at`, настройки (тайминги, правила).
- Player: `id`, `name`, `device_uuid`, `status` (ready/playing/done), `current_level`, `session` FK.
- Progress: `id`, `player` FK, `level` (green/yellow/red), `status`, `score`, `time_spent_ms`, `details` (JSON).
- LeaderboardSnapshot (опц.): `session` FK, `payload` (JSON), `created_at`.

WebSocket каналы и события
--------------------------
- Канал комнаты: `session_<id>` (ТВ + все игроки).
- Типы сообщений (JSON):
  - `session.state`: `{ session_id, status, round, timer? }`
  - `players.list`: `{ session_id, players: [...] }`
  - `player.update`: `{ session_id, player: {...} }`
  - `leaderboard.update`: `{ session_id, leaderboard: [...] }`
  - `game.event`: `{ session_id, kind, payload }` (переход уровня, мини-игра, бонусы)

REST/HTTP (минимум)
-------------------
- `POST /api/session`: создать/активировать сессию, вернуть код и состояние.
- `POST /api/session/{code}/join`: зарегистрировать игрока по имени → вернуть токен/uuid.
- `POST /api/session/{code}/start`: старт игры (может требовать роль/пин).
- `POST /api/progress`: отправить результат уровня/мини-игры `{player_token, level, score, time, details}`.
- `GET /api/session/{code}/state`: текущее состояние (для ресинхронизации).

Фронтенд (Vite + React)
-----------------------
- `/tv`: табло, музыка, конфетти, подключение к `session_<id>` по коду; показывает игроков, прогресс, места, таймер.
- `/play`: экран игрока; flow: join → готовность → уровни по очереди → отправка результатов → ожидание финала. Мини-игры можно грузить как лёгкие компоненты (tap, choose, puzzle-мини).
- Общий WebSocket-клиент: JSON-сообщения; reconnection/backoff; отображение ошибки соединения.

Поток
-----
1) ТВ показывает QR на `/play?session=<code>`, статус pending.
2) Игроки заходят, вводят имя, получают токен, попадают в список игроков; `players.list` летит на ТВ.
3) Хост стартует игру → `session.state: active`; уровни идут: green → yellow → red; между уровнями возможны `game.event` мини-игр.
4) Игроки отправляют результаты уровней; сервер считает очки, обновляет лидерборд и шлёт `player.update`/`leaderboard.update`.
5) После завершения красного уровня или таймера — `session.state: finished`, финальный рейтинг на ТВ, музыка/эффекты.

Технические заметки
-------------------
- ASGI-сервер: daphne/uvicorn, `channels_redis` как backend.
- Авторизация WS: по токену игрока/хоста через querystring/headers.
- Таймеры: Celery/asyncio tasks или in-memory с периодической рассылкой тиков в канал.
- Мини-игры: на первом шаге достаточно простых компонентов с клиентским расчётом и отправкой итогового счёта.


