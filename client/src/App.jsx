import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTelemetrySocket } from './useTelemetrySocket';
import DeviceCard from './DeviceCard';
import FleetMap from './FleetMap';
import TelemetryChart from './TelemetryChart';
import { buildGpsTrack, downsampleGpsTrack, downloadCsv, exportTrackCsv, getAllTelemetry, getAverageSpeed, getDevices, getGps, timestampMs } from './telemetry';
import './style.css';

const EMPTY_DEVICES = [];
const EMPTY_ROWS = [];

const REGIONS = [
  { value: 'all', label: 'Усі регіони' },
  { value: 'kyiv', label: 'Київ' },
  { value: 'lviv', label: 'Львів' },
  { value: 'odesa', label: 'Одеса' }
];

function getRange(period) {
  const now = Date.now();
  if (period === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { from: Math.floor(start.getTime() / 1000), to: Math.floor(now / 1000) };
  }
  return { from: Math.floor((now - 7 * 24 * 60 * 60 * 1000) / 1000), to: Math.floor(now / 1000) };
}

function normalizeLivePayload(payload) {
  if (!payload || !payload.device_id || !payload.metric || payload.value === undefined || payload.ts === undefined) return null;
  return {
    id: `live-${payload.device_id}-${payload.metric}-${payload.ts}`,
    device_id: payload.device_id,
    metric: payload.metric,
    value: typeof payload.value === 'object' ? JSON.stringify(payload.value) : String(payload.value),
    ts: Number(payload.ts),
    region: payload.region || 'unknown'
  };
}

function mergeRows(historyRows, liveRows) {
  const map = new Map();
  for (const row of historyRows || []) {
    map.set(`${row.device_id}:${row.metric}:${row.ts}`, row);
  }
  for (const row of liveRows || []) {
    map.set(`${row.device_id}:${row.metric}:${row.ts}`, row);
  }
  return [...map.values()].sort((a, b) => Number(a.ts) - Number(b.ts));
}

function App() {
  const queryClient = useQueryClient();
  const [region, setRegion] = useState('all');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [period, setPeriod] = useState('week');
  const [chartMetric, setChartMetric] = useState('speed');
  const [liveRows, setLiveRows] = useState([]);
  const [now, setNow] = useState(0);
  const [copiedMetric, setCopiedMetric] = useState('');

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
    refetchInterval: 30000
  });
  const devices = devicesQuery.data ?? EMPTY_DEVICES;
  const visibleDevices = useMemo(() => devices.filter(device => region === 'all' || device.region === region), [devices, region]);
  const activeDevice = visibleDevices.some(device => device.device_id === selectedDevice)
    ? selectedDevice
    : (visibleDevices[0]?.device_id || '');

  const telemetryQuery = useQuery({
    queryKey: ['telemetry', devices.map(device => device.device_id).join(','), period],
    enabled: devices.length > 0,
    queryFn: async () => {
      const range = getRange(period);
      return Promise.all(devices.map(async device => ({
        deviceId: device.device_id,
        rows: await getAllTelemetry({ device: device.device_id, from: range.from, to: range.to })
      })));
    },
    refetchInterval: 15000
  });

  const historyByDevice = useMemo(() => {
    const result = new Map();
    for (const item of telemetryQuery.data || []) result.set(item.deviceId, item.rows);
    return result;
  }, [telemetryQuery.data]);

  const averageSpeedQuery = useQuery({
    queryKey: ['average-speed', devices.map(device => device.device_id).join(',')],
    enabled: devices.length > 0,
    queryFn: async () => Promise.all(devices.map(async device => ({
      deviceId: device.device_id,
      result: await getAverageSpeed(device.device_id)
    }))),
    refetchInterval: 15000
  });
  const averageSpeedByDevice = useMemo(() => {
    const result = new Map();
    for (const item of averageSpeedQuery.data || []) result.set(item.deviceId, item.result);
    return result;
  }, [averageSpeedQuery.data]);

  const handleTelemetry = useCallback(payload => {
    const row = normalizeLivePayload(payload);
    if (!row) return;
    setLiveRows(current => {
      const key = `${row.device_id}:${row.metric}:${row.ts}`;
      if (current.some(item => `${item.device_id}:${item.metric}:${item.ts}` === key)) return current;
      return [...current.slice(-1999), row];
    });
    // The API write happens before the Socket.IO event, so refresh history shortly afterwards.
    queryClient.invalidateQueries({ queryKey: ['telemetry'] });
  }, [queryClient]);

  const socketRegions = useMemo(() => region === 'all' ? ['kyiv', 'lviv', 'odesa'] : [region], [region]);
  const { status, reconnectAttempts } = useTelemetrySocket(socketRegions, handleTelemetry);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearTimeout(initialTimer); clearInterval(timer); };
  }, []);

  const allRowsByDevice = useMemo(() => {
    const result = new Map();
    for (const device of devices) {
      result.set(device.device_id, mergeRows(historyByDevice.get(device.device_id) || [], liveRows.filter(row => row.device_id === device.device_id)));
    }
    return result;
  }, [devices, historyByDevice, liveRows]);

  const selectedRows = allRowsByDevice.get(activeDevice) ?? EMPTY_ROWS;
  const fullTrack = useMemo(() => buildGpsTrack(selectedRows), [selectedRows]);
  const reducedTrack = useMemo(() => downsampleGpsTrack(fullTrack, 500), [fullTrack]);

  const mapVehicles = useMemo(() => visibleDevices.map(device => {
    const rows = allRowsByDevice.get(device.device_id) || [];
    const latestGps = rows.filter(row => row.metric === 'gps').sort((a, b) => Number(b.ts) - Number(a.ts))[0];
    return {
      deviceId: device.device_id,
      region: device.region,
      point: latestGps ? getGps(latestGps.value) : null
    };
  }), [visibleDevices, allRowsByDevice]);

  const copyMqttExample = useCallback(async metric => {
    const examples = {
      gps: { lat: 50.4501, lon: 30.5234 },
      speed: 64,
      fuel: 72,
      engine: 'on'
    };
    const payload = {
      device_id: 'truck-07',
      metric,
      value: examples[metric],
      ts: Math.floor(Date.now() / 1000),
      region: 'kyiv'
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedMetric(metric);
    } catch {
      setCopiedMetric('error');
    }
  }, []);

  const onExport = () => {
    if (!reducedTrack.length) return;
    const csv = exportTrackCsv(reducedTrack);
    downloadCsv(`${activeDevice || 'fleet'}-gps-track-${period}.csv`, csv);
  };

  const gpsTotal = fullTrack.length;
  const gpsShown = reducedTrack.length;
  const lastUpdate = selectedRows.filter(row => row.metric === 'gps').sort((a, b) => Number(b.ts) - Number(a.ts))[0];
  const gpsAge = lastUpdate ? now - timestampMs(lastUpdate.ts) : Infinity;
  const fleetOnline = visibleDevices.filter(device => {
    const gps = (allRowsByDevice.get(device.device_id) || []).filter(row => row.metric === 'gps').sort((a, b) => Number(b.ts) - Number(a.ts))[0];
    return gps && now - timestampMs(gps.ts) <= 3 * 60 * 1000;
  }).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-icon" aria-hidden="true">F</div>
          <div>
            <p className="top-eyebrow">FLEET OPERATIONS</p>
            <h1>Моніторинг транспортного парку</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="connection-indicator">
            <span className={`connection-dot ${status === 'online' ? 'connected' : ''}`} />
            <span>{status === 'online' ? 'Онлайн' : status === 'offline' ? 'Немає з’єднання' : 'Підключення'}</span>
          </div>
          <label className="region-control">
            <span>Регіон</span>
            <select value={region} onChange={event => setRegion(event.target.value)}>
              {REGIONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-row">
          <div>
            <p className="section-kicker">ОГЛЯД АВТОПАРКУ</p>
            <h2>Диспетчерська панель</h2>
            <p className="subheading">Стан транспортних засобів і телеметрія в реальному часі.</p>
          </div>
          <div className="refresh-meta">
            <span className="refresh-pulse" /> Оновлення через REST та Socket.IO
          </div>
        </section>

        <section className="summary-grid" aria-label="Зведення автопарку">
          <article className="summary-card"><span className="summary-icon blue">▣</span><div><span>Транспортних засобів</span><strong>{visibleDevices.length}</strong></div><small>у вибраному регіоні</small></article>
          <article className="summary-card"><span className="summary-icon green">●</span><div><span>На зв’язку</span><strong>{fleetOnline}</strong></div><small>GPS-дані за останні 3 хв</small></article>
          <article className="summary-card"><span className="summary-icon violet">⌁</span><div><span>GPS-точок у періоді</span><strong>{gpsTotal.toLocaleString()}</strong></div><small>для {activeDevice || 'вибраного авто'}</small></article>
          <article className="summary-card"><span className="summary-icon amber">⇣</span><div><span>Точок після спрощення</span><strong>{gpsShown.toLocaleString()}<em> / 500 макс.</em></strong></div><small>алгоритм Douglas–Peucker</small></article>
        </section>

        <section className="section-block">
          <div className="section-heading">
            <div><h2>Транспортні засоби</h2><p>Оберіть картку, щоб переглянути маршрут і показники.</p></div>
            <span className="result-count">{visibleDevices.length} {visibleDevices.length === 1 ? 'одиниця' : 'одиниць'}</span>
          </div>
          {devicesQuery.isLoading ? <div className="panel-message">Завантаження списку транспортних засобів…</div> : null}
          {devicesQuery.isError ? <div className="panel-message error">{devicesQuery.error.message}. Перевір, чи запущений backend на порту 3000.</div> : null}
          {!devicesQuery.isLoading && !devicesQuery.isError && visibleDevices.length === 0 ? (
            <div className="empty-devices panel-message">
              <div className="empty-devices-icon" aria-hidden="true">⌁</div>
              <div className="empty-devices-copy">
                <h3>{devices.length === 0 ? 'Поки немає підключених транспортних засобів' : 'У цьому регіоні немає транспортних засобів'}</h3>
                <p>Пристрій з’явиться тут після того, як backend отримає й збереже перше коректне MQTT-повідомлення. Для швидкої перевірки використай топік і приклади нижче.</p>
              </div>
              <div className="mqtt-topic-line"><span>MQTT topic</span><code>fleet/truck-07/telemetry</code></div>
              <div className="mqtt-example-grid">
                {[
                  { metric: 'gps', label: 'GPS-координати', description: 'Покаже транспортний засіб на карті' },
                  { metric: 'speed', label: 'Швидкість', description: 'Значення в км/год' },
                  { metric: 'fuel', label: 'Рівень пального', description: 'Відсоток від 0 до 100' },
                  { metric: 'engine', label: 'Стан двигуна', description: 'Наприклад, on або off' }
                ].map(example => (
                  <div className="mqtt-example" key={example.metric}>
                    <div><strong>{example.label}</strong><span>{example.description}</span></div>
                    <button type="button" className="copy-payload-button" onClick={() => copyMqttExample(example.metric)}>
                      {copiedMetric === example.metric ? 'Скопійовано ✓' : `Копіювати ${example.metric}`}
                    </button>
                  </div>
                ))}
              </div>
              {copiedMetric === 'error' ? <p className="copy-error">Не вдалося скопіювати автоматично. Перевір дозволи браузера на буфер обміну.</p> : null}
              <p className="mqtt-help">Скопіюй JSON кнопкою та опублікуй його в MQTT Explorer у вказаний топік. Для перевірки використовуй пристрій <code>truck-07</code>, він прив’язаний до регіону «Київ». Поле <code>ts</code> генерується автоматично у форматі Unix timestamp у секундах.</p>
            </div>
          ) : null}
          <div className="device-grid">
            {visibleDevices.map(device => (
              <DeviceCard key={device.device_id} device={device} rows={allRowsByDevice.get(device.device_id) || []} averageSpeed={averageSpeedByDevice.get(device.device_id)} selected={activeDevice === device.device_id} onSelect={setSelectedDevice} now={now} />
            ))}
          </div>
        </section>

        <section className="content-grid">
          <article className="panel map-panel">
            <div className="panel-heading">
              <div><h2>Карта автопарку</h2><p>Поточні координати та маршрут вибраного транспортного засобу.</p></div>
              <span className="live-badge"><span /> LIVE</span>
            </div>
            <FleetMap vehicles={mapVehicles} track={reducedTrack} selectedDevice={activeDevice} />
            <div className="map-legend"><span><i className="legend-marker" /> Транспортний засіб</span><span><i className="legend-line" /> GPS-маршрут</span></div>
          </article>

          <article className="panel chart-panel">
            <div className="panel-heading chart-heading">
              <div><h2>Історія телеметрії</h2><p>{activeDevice || 'Транспортний засіб не вибрано'}</p></div>
            </div>
            <div className="chart-controls">
              <label><span>Показник</span><select value={chartMetric} onChange={event => setChartMetric(event.target.value)}><option value="speed">Швидкість</option><option value="fuel">Рівень пального</option></select></label>
              <div className="segmented-control" aria-label="Період графіка">
                <button type="button" className={period === 'today' ? 'active' : ''} onClick={() => setPeriod('today')}>Сьогодні</button>
                <button type="button" className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>7 днів</button>
              </div>
            </div>
            {telemetryQuery.isError ? <div className="chart-error">Не вдалося завантажити історію: {telemetryQuery.error.message}</div> : <TelemetryChart rows={selectedRows} metric={chartMetric} />}
            <div className="chart-footnote"><span>●</span> Часові мітки беруться з телеметрії пристрою.</div>
          </article>
        </section>

        <section className="panel export-panel">
          <div className="export-copy">
            <div className="export-icon">⇩</div>
            <div><h2>Експорт GPS-маршруту</h2><p>Завантажте спрощений маршрут у CSV для подальшого аналізу. Файл містить стовпці ts, lat, lon, speed.</p></div>
          </div>
          <div className="export-actions">
            <div className="point-count"><strong>{gpsTotal.toLocaleString()}</strong><span>до спрощення</span><b>→</b><strong>{gpsShown.toLocaleString()}</strong><span>після</span></div>
            <button type="button" className="primary-button" onClick={onExport} disabled={!reducedTrack.length} title={!reducedTrack.length ? 'Немає GPS-точок для експорту' : 'Завантажити CSV'}>↓ Експортувати CSV</button>
          </div>
        </section>

        <footer className="dashboard-footer">
          <span>FLEET API · Практична робота № 4</span>
          <span>Socket.IO: {status} · Спроби перепідключення: {reconnectAttempts}</span>
          <span>{lastUpdate && gpsAge <= 3 * 60 * 1000 ? 'GPS оновлено нещодавно' : 'Очікування актуальних GPS-даних'}</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
