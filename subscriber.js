const mqtt = require("mqtt");
const db = require("./db");

const insertRow = db.prepare(`
    INSERT INTO telemetry (device_id, metric, value, ts)
    VALUES (?, ?, ?, ?)
`);

const client = mqtt.connect("mqtt://localhost:1883");

client.on("connect", () => {
    console.log("Підключено до MQTT-брокера");

    client.subscribe("fleet/+/telemetry", { qos: 1 }, (err) => {
        if (err) {
            console.error("Помилка підписки:", err.message);
        } else {
            console.log("Підписано на fleet/+/telemetry");
        }
    });
});

client.on("message", (topic, payload) => {
    const parts = topic.split("/");

    if (parts.length !== 3) {
        console.error("Некоректний MQTT topic:", topic);
        return;
    }

    const deviceId = parts[1];

    try {
        const data = JSON.parse(payload.toString());

        if (
            typeof data.metric !== "string" ||
            typeof data.value !== "number"
        ) {
            console.error("Некоректний формат телеметрії:", data);
            return;
        }

        const timestamp =
            data.ts !== undefined ? Number(data.ts) : Date.now();

        insertRow.run(
            deviceId,
            data.metric,
            data.value,
            timestamp
        );

        console.log(
            `Збережено: device=${deviceId}, metric=${data.metric}, value=${data.value}, ts=${timestamp}`
        );
    } catch (error) {
        console.error(
            `Помилка обробки повідомлення ${topic}:`,
            error.message
        );
    }
});