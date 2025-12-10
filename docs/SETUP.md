# Инструкция по установке и запуску

## Требования

- Python 3.11+
- Node.js 18+
- Redis (через Docker или локально)
- Доступ к локальной сети

## Шаг 1: Backend

```bash
cd backend

# Создать виртуальное окружение
python -m venv .venv

# Активировать (Windows)
.venv\Scripts\activate

# Активировать (Linux/Mac)
source .venv/bin/activate

# Установить зависимости
pip install -r requirements.txt

# Создать .env файл
cp .env.example .env
# Отредактировать .env при необходимости

# Запустить Redis
docker run -d -p 6379:6379 --name redis redis:7

# Применить миграции
python manage.py migrate

# (Опционально) Создать суперпользователя для админки
python manage.py createsuperuser

# Запустить сервер
daphne -b 0.0.0.0 -p 8000 snowparty.asgi:application
```

Сервер будет доступен на `http://<ваш_IP>:8000`

## Шаг 2: Frontend

```bash
cd frontend

# Установить зависимости
npm install

# (Опционально) Создать .env файл
# VITE_API_BASE=http://<ваш_IP>:8000/api

# Запустить dev-сервер
npm run dev -- --host
```

Фронтенд будет доступен на `http://<ваш_IP>:5173`

## Шаг 3: Проверка

1. Откройте на ТВ: `http://<ваш_IP>:5173/tv`
2. Откройте на телефоне: `http://<ваш_IP>:5173/play?session=<код_из_ТВ>`
3. Введите имя и присоединитесь
4. Нажмите "Начать игру" на ТВ
5. Играйте!

## Troubleshooting

### Redis не запускается
```bash
# Проверить, запущен ли Redis
docker ps | grep redis

# Или запустить локально (если установлен)
redis-server
```

### WebSocket не подключается
- Убедитесь, что Redis запущен
- Проверьте, что порт 8000 доступен
- Проверьте настройки CORS в `backend/snowparty/settings.py`

### Проблемы с сетью
- Убедитесь, что все устройства в одной сети
- Проверьте firewall настройки
- Используйте IP-адрес вместо localhost

## Production

Для production используйте:
- `npm run build` для сборки фронтенда
- `python manage.py collectstatic` для статики
- Настройте nginx/reverse proxy для статики
- Используйте PostgreSQL вместо SQLite
- Настройте правильные SECRET_KEY и DEBUG=False


