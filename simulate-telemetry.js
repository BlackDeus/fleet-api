
const mqtt = require("mqtt");

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";

const client = mqtt.connect(MQTT_URL);

const vehicles = [
    {
        device_id: "truck-07",
        region: "kyiv",
        lat: 50.4501,
        lon: 30.5234,
        speed: 54,
        fuel: 78,
        engine: "on",
        step: 0
    },
    {
        device_id: "truck-08",
        region: "lviv",
        lat: 49.8397,
        lon: 24.0297,
        speed: 42,
        fuel: 65,
        engine: "on",
        step: 0
    },
    {
        device_id: "truck-09",
        region: "odesa",
        lat: 46.4825,
        lon: 30.7233,
        speed: 67,
        fuel: 34,
        engine: "on",
        step: 0
    }
];

function publishTelemetry(vehicle, metric, value) {
    const topic = `fleet/${vehicle.device_id}/telemetry`;

    const payload = {
        device_id: vehicle.device_id,
        metric,
        value,
        ts: Math.floor(Date.now() / 1000),
        region: vehicle.region
    };

    client.publish(topic, JSON.stringify(payload), { qos: 0 }, (error) => {
        if (error) {
            console.error(
                `[MQTT] Ошибка публикации ${vehicle.device_id}/${metric}:`,
                error.message
            );
            return;
        }

        console.log(
            `[MQTT] ${vehicle.device_id} | ${metric} = ${JSON.stringify(value)}`
        );
    });
}

function updateVehicle(vehicle) {
    // Имитируем движение по небольшому маршруту.
    vehicle.step += 1;

    vehicle.lat += Math.sin(vehicle.step / 5) * 0.00015;
    vehicle.lon += Math.cos(vehicle.step / 5) * 0.00015;

    // Имитируем изменение скорости.
    vehicle.speed += Math.random() * 10 - 5;
    vehicle.speed = Math.max(0, Math.min(110, vehicle.speed));
    vehicle.speed = Math.round(vehicle.speed);

    // GPS и скорость отправляются каждые 2 секунды.
    publishTelemetry(vehicle, "gps", {
        lat: Number(vehicle.lat.toFixed(6)),
        lon: Number(vehicle.lon.toFixed(6))
    });

    publishTelemetry(vehicle, "speed", vehicle.speed);

    // Топливо отправляется примерно раз в 30 секунд.
    if (vehicle.step % 15 === 0) {
        vehicle.fuel = Math.max(
            0,
            vehicle.fuel - Math.random() * 0.4
        );

        publishTelemetry(
            vehicle,
            "fuel",
            Number(vehicle.fuel.toFixed(1))
        );
    }

    // Состояние двигателя отправляется примерно раз в минуту.
    if (vehicle.step % 30 === 0) {
        publishTelemetry(vehicle, "engine", vehicle.engine);
    }
}

client.on("connect", () => {
    console.log(`[MQTT] Подключено к брокеру ${MQTT_URL}`);
    console.log("[SIM] Запущена симуляция трёх транспортных средств.");

    // Сразу отправляем первые данные.
    vehicles.forEach((vehicle) => {
        publishTelemetry(vehicle, "gps", {
            lat: vehicle.lat,
            lon: vehicle.lon
        });

        publishTelemetry(vehicle, "speed", vehicle.speed);
        publishTelemetry(vehicle, "fuel", vehicle.fuel);
        publishTelemetry(vehicle, "engine", vehicle.engine);
    });

    // Далее обновляем телеметрию каждые 2 секунды.
    setInterval(() => {
        vehicles.forEach(updateVehicle);
    }, 2000);
});

client.on("reconnect", () => {
    console.log("[MQTT] Повторное подключение к брокеру...");
});

client.on("error", (error) => {
    console.error("[MQTT] Ошибка:", error.message);
});

function shutdown() {
    console.log("\n[SIM] Остановка симулятора...");

    client.end(false, {}, () => {
        process.exit(0);
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
