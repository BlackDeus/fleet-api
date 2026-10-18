const http = require('http');
const path = require('path');

const express = require('express');
const { Server } = require('socket.io');
const mqtt = require('mqtt');

const db = require('./db');

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
});

const PORT = 3000;
const MQTT_URL = 'mqtt://localhost:1883';

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/*
 * ---------------------------------------------------------
 * РЕГІОНИ ТРАНСПОРТНИХ ЗАСОБІВ
 * ---------------------------------------------------------
 */

const DEVICE_REGIONS = {
  'truck-07': 'kyiv',
  'truck-08': 'lviv',
  'truck-09': 'odesa'
};

function getDeviceRegion(deviceId) {
  return DEVICE_REGIONS[deviceId] || 'unknown';
}

/*
 * ---------------------------------------------------------
 * REST API
 * ---------------------------------------------------------
 */

app.get('/api/v1/devices', (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT device_id
    FROM telemetry
    ORDER BY device_id
  `).all();

  const devices = rows.map(row => ({
    device_id: row.device_id,
    region: getDeviceRegion(row.device_id)
  }));

  res.json(devices);
});


app.get('/api/v1/telemetry', (req, res) => {
  const {
    device,
    metric,
    from,
    to,
    limit = 100,
    cursor,
    pagination
  } = req.query;

  if (!device) {
    return res.status(400).json({
      error: 'Параметр device є обов’язковим'
    });
  }

  const safeLimit = Math.min(
    Math.max(parseInt(limit, 10) || 100, 1),
    1000
  );
  const cursorMode = pagination === 'cursor' || Boolean(cursor);

  let sql = `
    SELECT id, device_id, metric, value, ts
    FROM telemetry
    WHERE device_id = ?
  `;
  const params = [device];

  if (metric) {
    sql += ` AND metric = ?`;
    params.push(metric);
  }

  if (from !== undefined) {
    const fromTs = Number(from);
    if (!Number.isFinite(fromTs)) {
      return res.status(400).json({ error: 'Параметр from має бути числом' });
    }
    sql += ` AND ts >= ?`;
    params.push(fromTs);
  }

  if (to !== undefined) {
    const toTs = Number(to);
    if (!Number.isFinite(toTs)) {
      return res.status(400).json({ error: 'Параметр to має бути числом' });
    }
    sql += ` AND ts <= ?`;
    params.push(toTs);
  }

  if (cursor) {
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Некоректний курсор пагінації' });
    }
    if (!decoded || typeof decoded !== 'object' || !Number.isFinite(Number(decoded.ts)) || !Number.isFinite(Number(decoded.id))) {
      return res.status(400).json({ error: 'Некоректний курсор пагінації' });
    }
    sql += ` AND (ts > ? OR (ts = ? AND id > ?))`;
    params.push(Number(decoded.ts), Number(decoded.ts), Number(decoded.id));
  }

  sql += ` ORDER BY ts ASC, id ASC LIMIT ?`;
  params.push(cursorMode ? safeLimit + 1 : safeLimit);

  const rows = db.prepare(sql).all(...params);
  if (!cursorMode) {
    return res.json(rows);
  }

  const hasMore = rows.length > safeLimit;
  const data = hasMore ? rows.slice(0, safeLimit) : rows;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ ts: Number(last.ts), id: Number(last.id) })).toString('base64url')
    : null;

  return res.json({
    data,
    next_cursor: nextCursor,
    has_more: hasMore
  });
});

// Average speed for the most recent time window (timestamps in the database are Unix seconds).
app.get('/api/v1/devices/:deviceId/average-speed', (req, res) => {
  const minutes = Math.min(Math.max(parseInt(req.query.minutes, 10) || 15, 1), 1440);
  const now = Math.floor(Date.now() / 1000);
  const from = now - minutes * 60;
  const result = db.prepare(`
    SELECT AVG(CAST(value AS REAL)) AS average_speed, COUNT(*) AS samples
    FROM telemetry
    WHERE device_id = ? AND metric = 'speed' AND ts >= ? AND ts <= ?
  `).get(req.params.deviceId, from, now);

  return res.json({
    device_id: req.params.deviceId,
    minutes,
    average_speed: result.samples ? Number(result.average_speed) : null,
    samples: result.samples,
    from,
    to: now
  });
});

/*
 * ---------------------------------------------------------
 * SOCKET.IO
 * ---------------------------------------------------------
 */

io.on('connection', socket => {
  console.log(`[Socket.IO] Нове з'єднання: ${socket.id}`);

  socket.on('join-region', region => {
    if (!region || typeof region !== 'string') {
      return;
    }

    const normalizedRegion = region.toLowerCase().trim();

    const room = `fleet:${normalizedRegion}`;

    socket.join(room);

    socket.data.region = normalizedRegion;

    console.log(
      `[Socket.IO] ${socket.id} підписаний на ${room}`
    );

    socket.emit('region:joined', {
      region: normalizedRegion,
      room
    });
  });

  socket.on('leave-region', region => {
    if (!region || typeof region !== 'string') {
      return;
    }

    const normalizedRegion = region.toLowerCase().trim();

    const room = `fleet:${normalizedRegion}`;

    socket.leave(room);

    console.log(
      `[Socket.IO] ${socket.id} залишив ${room}`
    );
  });

  socket.on('disconnect', reason => {
    console.log(
      `[Socket.IO] ${socket.id} disconnected: ${reason}`
    );
  });
});


/*
 * ---------------------------------------------------------
 * MQTT → DATABASE → SOCKET.IO
 * ---------------------------------------------------------
 */

const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on('connect', () => {
  console.log('[MQTT] Підключено до MQTT broker');

  mqttClient.subscribe(
    'fleet/+/telemetry',
    err => {
      if (err) {
        console.error(
          '[MQTT] Помилка підписки:',
          err.message
        );

        return;
      }

      console.log(
        '[MQTT] Підписка: fleet/+/telemetry'
      );
    }
  );
});


mqttClient.on('error', err => {
  console.error(
    '[MQTT] Помилка:',
    err.message
  );
});


mqttClient.on('message', (topic, message) => {
  let payload;

  /*
   * Обов'язково парсимо JSON.
   */

  try {
    payload = JSON.parse(
      message.toString('utf8')
    );
  } catch (err) {
    console.error(
      '[MQTT] Некоректний JSON:',
      err.message
    );

    return;
  }

  /*
   * Перевіряємо мінімально необхідні поля.
   */

  if (
    !payload.device_id ||
    !payload.metric ||
    payload.value === undefined ||
    payload.ts === undefined
  ) {
    console.error(
      '[MQTT] Некоректний payload:',
      payload
    );

    return;
  }

  /*
   * Визначаємо регіон.
   */

  const region =
    payload.region ||
    getDeviceRegion(payload.device_id);

  payload.region = region;

  /*
   * Запис у SQLite.
   */

  try {
    db.prepare(`
    INSERT INTO telemetry (
        device_id,
        metric,
        value,
        ts
    )
    VALUES (?, ?, ?, ?)
    `).run(
    payload.device_id,
    payload.metric,
    typeof payload.value === "object"
        ? JSON.stringify(payload.value)
        : String(payload.value),
    payload.ts
    );
  } catch (err) {
    console.error(
      '[DB] Помилка запису:',
      err.message
    );

    return;
  }

  /*
   * Трансляція тільки в кімнату потрібного регіону.
   */

  const room = `fleet:${region}`;

  io.to(room).emit(
    'telemetry:update',
    payload
  );

  console.log(
    `[REALTIME] ${room}`,
    payload
  );
});


/*
 * ---------------------------------------------------------
 * FRONTEND
 * ---------------------------------------------------------
 */

const clientPath = path.join(
  __dirname,
  'client',
  'dist'
);

app.use(express.static(clientPath));


/*
 * ---------------------------------------------------------
 * START SERVER
 * ---------------------------------------------------------
 */

httpServer.listen(PORT, () => {
  console.log(
    `Socket.IO listening on port ${PORT}`
  );

  console.log(
    `http://localhost:${PORT}`
  );
});