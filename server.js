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
    limit = 100
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

  let sql = `
    SELECT
      id,
      device_id,
      metric,
      value,
      ts
    FROM telemetry
    WHERE device_id = ?
  `;

  const params = [device];

  if (metric) {
    sql += ` AND metric = ?`;
    params.push(metric);
  }

  if (from) {
    sql += ` AND ts >= ?`;
    params.push(Number(from));
  }

  if (to) {
    sql += ` AND ts <= ?`;
    params.push(Number(to));
  }

  sql += `
    ORDER BY ts ASC
    LIMIT ?
  `;

  params.push(safeLimit);

  const rows = db.prepare(sql).all(...params);

  res.json(rows);
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