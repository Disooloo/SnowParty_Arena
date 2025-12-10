Frontend (Vite + React)
=======================

План:
- Инициализировать Vite: `npm create vite@latest frontend -- --template react`.
- Включить `/tv` и `/play` маршруты (react-router).
- Общий WebSocket-клиент для `ws://<host>:8000/ws/session/<code>/`.
- Поддержать автоподключение по `session` из querystring/QR.

Dev-запуск:
```
npm install
npm run dev -- --host
```

