// Optional standalone MQTT subscriber for isolated testing only.
// The normal application already subscribes to MQTT inside server.js.
// To use this script, stop server.js first and explicitly opt in:
// RUN_STANDALONE_MQTT_SUBSCRIBER=true node subscriber.js
if (process.env.RUN_STANDALONE_MQTT_SUBSCRIBER !== 'true') {
  console.log('[MQTT] subscriber.js вимкнено: MQTT-підписка вже працює в server.js.');
  console.log('[MQTT] Не запускай два підписники одночасно, щоб уникнути дублювання записів.');
  process.exit(0);
}

const mqtt = require('mqtt');
const db = require('./db');

const insertRow = db.prepare(`
  INSERT INTO telemetry (device_id, metric, value, ts)
  VALUES (?, ?, ?, ?)
`);
const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883');

client.on('connect', () => {
  console.log('[MQTT] Окремий підписник підключений. Переконайся, що server.js зупинений.');
  client.subscribe('fleet/+/telemetry', { qos: 1 }, error => {
    if (error) console.error('[MQTT] Помилка підписки:', error.message);
    else console.log('[MQTT] Підписка: fleet/+/telemetry');
  });
});

client.on('message', (topic, message) => {
  const parts = topic.split('/');
  if (parts.length !== 3 || parts[0] !== 'fleet' || parts[2] !== 'telemetry') {
    console.error('[MQTT] Некоректний topic:', topic);
    return;
  }

  try {
    const payload = JSON.parse(message.toString('utf8'));
    const deviceId = payload.device_id || parts[1];
    if (!deviceId || typeof payload.metric !== 'string' || payload.value === undefined || payload.ts === undefined) {
      console.error('[MQTT] Некоректний payload: очікуються device_id, metric, value та ts.', payload);
      return;
    }

    let timestamp = Number(payload.ts);
    if (!Number.isFinite(timestamp)) {
      console.error('[MQTT] ts має бути Unix timestamp у секундах:', payload.ts);
      return;
    }
    // Be tolerant of old senders that incorrectly provide milliseconds.
    if (timestamp >= 1e12) timestamp = Math.floor(timestamp / 1000);

    const value = typeof payload.value === 'object'
      ? JSON.stringify(payload.value)
      : String(payload.value);
    insertRow.run(deviceId, payload.metric, value, timestamp);
    console.log(`[DB] Збережено ${deviceId}/${payload.metric} @ ${timestamp}`);
  } catch (error) {
    console.error('[MQTT] Помилка обробки повідомлення:', error.message);
  }
});

client.on('error', error => console.error('[MQTT] Помилка:', error.message));
process.on('SIGINT', () => {
  client.end(true, () => {
    db.close();
    process.exit(0);
  });
});
