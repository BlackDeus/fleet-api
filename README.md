# Fleet API — Practical Assignment No. 4

A web dashboard for monitoring a vehicle fleet. This project extends the existing Node.js + Express + SQLite + MQTT + Socket.IO architecture and adds a React interface featuring a fleet overview, telemetry history, an OpenStreetMap map, and CSV export of GPS tracks.

## Requirements

- Node.js 20.19+ or 22.12+.
- An MQTT broker accessible at `mqtt://localhost:1883`.
- npm.

## Installation

In the project root directory, run:

```bash
npm install
```

In the `client` directory, run:

```bash
cd client
npm install
```

If necessary, copy `client/.env.example` to `client/.env` and update `VITE_API_URL`.

## Running the Application

In the first terminal, from the project root directory, run:

```bash
npm start
```

In the second terminal, run:

```bash
cd client
npm run dev
```

Open the URL displayed by Vite (usually `http://localhost:5173`).

The MQTT subscription is already implemented in `server.js`, so under normal operating conditions, you only need to run the server. `subscriber.js` is retained as an optional standalone tool for isolated testing and is disabled by default.

Do not run two subscribers simultaneously. If you need to test `subscriber.js` separately, stop `server.js` first, then execute:

```bash
RUN_STANDALONE_MQTT_SUBSCRIBER=true node subscriber.js
```

In PowerShell, use:

```powershell
$env:RUN_STANDALONE_MQTT_SUBSCRIBER="true"; node subscriber.js
```

## MQTT Message Format

Topic: `fleet/<device_id>/telemetry`

Example message:

```json
{
  "device_id": "truck-07",
  "metric": "gps",
  "value": { "lat": 50.4501, "lon": 30.5234 },
  "ts": 1781542800
}
```

For the dashboard cards and charts, also publish the following metrics:

- `speed` — a numeric value in km/h.
- `fuel` — a numeric value representing the fuel level as a percentage.
- `engine` — for example, `on` or `off`.

The `ts` field must contain a Unix timestamp in seconds.

The empty-state screen includes buttons for copying sample JSON messages. These messages can be published to the same topic using MQTT Explorer.

If a particular metric is not available in the database, the interface displays `—` instead of an invented value.

## API Endpoints

- `GET /api/v1/devices` — returns a list of devices.
- `GET /api/v1/telemetry?device=truck-07&from=<unix>&to=<unix>&limit=1000` — returns telemetry history in the legacy array format for backward compatibility.
- `GET /api/v1/telemetry?device=truck-07&from=<unix>&to=<unix>&limit=1000&pagination=cursor` — returns telemetry history using cursor-based pagination in the format `{ data, next_cursor, has_more }`.
- `GET /api/v1/devices/truck-07/average-speed?minutes=15` — returns the average speed over the last 15 minutes or another specified time window.

## GPS Tracking

The GPS track is generated from historical `gps` records. Speed values are matched using the nearest `speed` timestamp.

The Douglas–Peucker algorithm is used to reduce the number of GPS points. The number of points displayed on the map and included in the export is limited to 500.

The exported CSV file contains the following columns:

`ts`, `lat`, `lon`, `speed`

## Build and Code Quality Checks

After installing the dependencies, verify the frontend by running `npm run build` from the `client` directory.

To check code style, run:

```bash
npm run lint
```
