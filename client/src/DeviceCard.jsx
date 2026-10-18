import { formatTime, getGps, parseMetricValue, timestampMs } from './telemetry';

function latest(rows, metric) {
  return rows
    .filter(row => row.metric === metric)
    .sort((a, b) => Number(b.ts) - Number(a.ts))[0] || null;
}

function numberValue(row) {
  if (!row) return null;
  const value = Number(parseMetricValue(row.value));
  return Number.isFinite(value) ? value : null;
}

function getState(rows, now) {
  const gps = latest(rows, 'gps');
  const fuel = numberValue(latest(rows, 'fuel'));
  const speed = numberValue(latest(rows, 'speed'));
  const gpsAge = gps ? now - timestampMs(gps.ts) : Infinity;

  if (gpsAge > 3 * 60 * 1000) return { label: 'Немає даних', icon: '⚪', className: 'neutral' };
  if (fuel !== null && fuel < 10) return { label: 'Критичний рівень пального', icon: '🔴', className: 'critical' };
  if (fuel !== null && fuel < 20) return { label: 'Потрібна увага', icon: '🟠', className: 'warning' };
  if (speed !== null && speed > 120) return { label: 'Перевищення швидкості', icon: '⚠️', className: 'warning' };
  return { label: 'На зв’язку', icon: '🟢', className: 'good' };
}

export default function DeviceCard({ device, rows, averageSpeed, selected, onSelect, now }) {
  const gpsRow = latest(rows, 'gps');
  const gps = gpsRow ? getGps(gpsRow.value) : null;
  const speed = numberValue(latest(rows, 'speed'));
  const fuel = numberValue(latest(rows, 'fuel'));
  const engineRow = latest(rows, 'engine');
  const engineValue = engineRow ? String(parseMetricValue(engineRow.value)) : null;
  const state = getState(rows, now);

  return (
    <button
      type="button"
      className={`device-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(device.device_id)}
      aria-pressed={selected}
    >
      <div className="device-card-head">
        <div>
          <span className="eyebrow">ТРАНСПОРТНИЙ ЗАСІБ</span>
          <h3>{device.device_id}</h3>
        </div>
        <span className={`state-mark ${state.className}`} aria-label={state.label}>{state.icon}</span>
      </div>
      <div className={`device-state ${state.className}`}>{state.label}</div>
      <div className="device-metrics">
        <div><span>Швидкість</span><strong>{speed === null ? '—' : `${speed} км/год`}</strong></div>
        <div><span>Сер. за 15 хв</span><strong>{averageSpeed?.average_speed == null ? '—' : `${Number(averageSpeed.average_speed).toFixed(1)}`}</strong></div>
        <div><span>Пальне</span><strong>{fuel === null ? '—' : `${fuel}%`}</strong></div>
        <div><span>Двигун</span><strong>{engineValue === null ? '—' : engineValue}</strong></div>
      </div>
      <div className="device-footer">
        <span>Регіон: {(device.region || 'unknown').toUpperCase()}</span>
        <span>{gps ? `${gps.lat.toFixed(4)}, ${gps.lon.toFixed(4)}` : 'GPS: —'}</span>
      </div>
      {gpsRow && <div className="device-updated">GPS оновлено: {formatTime(gpsRow.ts)}</div>}
    </button>
  );
}
