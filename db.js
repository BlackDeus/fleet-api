const Database = require("better-sqlite3");

const db = new Database("telemetry.db");

db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value TEXT NOT NULL,
        ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_lookup
        ON telemetry (device_id, metric, ts);
`);

module.exports = db;