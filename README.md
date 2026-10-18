# Fleet API — практична робота № 4

Вебдашборд для моніторингу транспортного парку. Проєкт продовжує наявну структуру Node.js + Express + SQLite + MQTT + Socket.IO та додає React-інтерфейс із карткою автопарку, історією телеметрії, картою OpenStreetMap і CSV-експортом GPS-треку.

## Вимоги

- Node.js 20.19+ або 22.12+.
- MQTT-брокер, доступний за `mqtt://localhost:1883`.
- npm.

## Встановлення

У кореневій папці проєкту:

```bash
npm install
```

У папці `client`:

```bash
cd client
npm install
```

За потреби скопіюйте `client/.env.example` у `client/.env` та змініть `VITE_API_URL`.

## Запуск

У першому терміналі, з кореня проєкту:

```bash
npm start
```

У другому терміналі:

```bash
cd client
npm run dev
```

Відкрийте адресу, яку покаже Vite (зазвичай `http://localhost:5173`). MQTT-підписка вже працює всередині `server.js`, тому в звичайному режимі достатньо запускати саме його. `subscriber.js` залишено як необов’язковий окремий інструмент для ізольованого тестування; за замовчуванням він вимкнений. Не запускайте два підписники одночасно. Якщо потрібно окремо тестувати `subscriber.js`, спочатку зупиніть `server.js`, а потім виконайте `RUN_STANDALONE_MQTT_SUBSCRIBER=true node subscriber.js` (PowerShell: `$env:RUN_STANDALONE_MQTT_SUBSCRIBER="true"; node subscriber.js`).

## MQTT-формат

Топік: `fleet/<device_id>/telemetry`.

```json
{
  "device_id": "truck-07",
  "metric": "gps",
  "value": { "lat": 50.4501, "lon": 30.5234 },
  "ts": 1781542800
}
```

Для карток і графіків додатково надсилайте метрики `speed` (число, км/год), `fuel` (число, відсоток) та `engine` (наприклад, `on`/`off`). `ts` має бути Unix timestamp у секундах. На екрані порожнього списку є кнопки для копіювання тестових JSON-повідомлень; їх можна публікувати в MQTT Explorer у той самий топік. Якщо певної метрики в базі немає, інтерфейс показує `—`, а не вигадане значення.

## API

- `GET /api/v1/devices` — список пристроїв.
- `GET /api/v1/telemetry?device=truck-07&from=<unix>&to=<unix>&limit=1000` — історія телеметрії, сумісний старий формат масиву.
- `GET /api/v1/telemetry?device=truck-07&from=<unix>&to=<unix>&limit=1000&pagination=cursor` — курсорна пагінація у форматі `{ data, next_cursor, has_more }`.
- `GET /api/v1/devices/truck-07/average-speed?minutes=15` — середня швидкість за останні 15 хвилин або інше задане вікно.

## Рівень 5

GPS-трек формується з історичних записів `gps`, а швидкість зіставляється за найближчою часовою міткою `speed`. Для зменшення кількості GPS-точок використовується Douglas–Peucker; кількість точок для карти та експорту обмежується 500. CSV містить колонки `ts`, `lat`, `lon`, `speed`.

Після встановлення залежностей перевірте frontend командою `npm run build` з папки `client` та `npm run lint` для перевірки стилю.
