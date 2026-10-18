const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getDevices() {
  const response = await fetch(`${API_BASE}/api/v1/devices`);
  if (!response.ok) throw new Error('Не вдалося завантажити список транспортних засобів');
  return response.json();
}


export async function getAverageSpeed(device) {
  const response = await fetch(`${API_BASE}/api/v1/devices/${encodeURIComponent(device)}/average-speed?minutes=15`);
  if (!response.ok) throw new Error(`Не вдалося отримати середню швидкість для ${device}`);
  return response.json();
}

export async function getTelemetryPage({ device, from, to, cursor, limit = 1000 }) {
  const params = new URLSearchParams({
    device,
    from: String(from),
    to: String(to),
    limit: String(limit),
    pagination: 'cursor'
  });
  if (cursor) params.set('cursor', cursor);

  const response = await fetch(`${API_BASE}/api/v1/telemetry?${params}`);
  if (!response.ok) throw new Error(`Не вдалося завантажити телеметрію для ${device}`);
  const result = await response.json();
  // Backward compatibility if the backend still returns a plain array.
  if (Array.isArray(result)) return { data: result, next_cursor: null, has_more: false };
  return result;
}

export async function getAllTelemetry({ device, from, to }) {
  const allRows = [];
  let cursor = null;
  let pageCount = 0;

  do {
    const page = await getTelemetryPage({ device, from, to, cursor });
    allRows.push(...page.data);
    cursor = page.has_more ? page.next_cursor : null;
    pageCount += 1;
    // Safety guard prevents an accidental endless pagination loop.
    if (pageCount >= 100) break;
  } while (cursor);

  return allRows.sort((a, b) => Number(a.ts) - Number(b.ts) || Number(a.id) - Number(b.id));
}

export function parseMetricValue(value) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    const numeric = Number(value);
    return value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
  }
}

export function timestampMs(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value)) return 0;
  // Existing project records use Unix seconds; also tolerate milliseconds.
  return value < 1e12 ? value * 1000 : value;
}

export function formatTime(ts) {
  const date = new Date(timestampMs(ts));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getGps(value) {
  const parsed = parseMetricValue(value);
  if (!parsed || typeof parsed !== 'object') return null;
  const lat = Number(parsed.lat);
  const lon = Number(parsed.lon ?? parsed.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function perpendicularDistance(point, start, end) {
  const dx = end.lon - start.lon;
  const dy = end.lat - start.lat;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.lon - start.lon, point.lat - start.lat);
  }
  const t = Math.max(0, Math.min(1,
    ((point.lon - start.lon) * dx + (point.lat - start.lat) * dy) / (dx * dx + dy * dy)
  ));
  const projection = { lon: start.lon + t * dx, lat: start.lat + t * dy };
  return Math.hypot(point.lon - projection.lon, point.lat - projection.lat);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points.slice();
  let maxDistance = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, index + 1), tolerance);
    const right = douglasPeucker(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

export function downsampleGpsTrack(points, maxPoints = 500) {
  if (points.length <= maxPoints) return points.slice();
  let tolerance = 0.00001;
  let result = douglasPeucker(points, tolerance);
  let attempts = 0;
  while (result.length > maxPoints && attempts < 40) {
    tolerance *= 1.6;
    result = douglasPeucker(points, tolerance);
    attempts += 1;
  }

  // Preserve a uniformly distributed fallback if a pathological track remains too large.
  if (result.length > maxPoints) {
    const step = (result.length - 1) / (maxPoints - 1);
    result = Array.from({ length: maxPoints }, (_, index) => result[Math.round(index * step)]);
  }
  return result;
}

export function buildGpsTrack(rows) {
  const gpsRows = rows
    .filter(row => row.metric === 'gps')
    .map(row => {
      const gps = getGps(row.value);
      return gps ? { ...gps, ts: Number(row.ts), id: row.id, speed: null } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts || Number(a.id) - Number(b.id));

  const speeds = rows.filter(row => row.metric === 'speed');
  return gpsRows.map(point => {
    const exact = speeds.find(row => Number(row.ts) === point.ts);
    const closest = exact || speeds.reduce((best, row) => {
      if (!best) return row;
      return Math.abs(Number(row.ts) - point.ts) < Math.abs(Number(best.ts) - point.ts) ? row : best;
    }, null);
    return { ...point, speed: closest ? Number(parseMetricValue(closest.value)) : null };
  });
}

export function exportTrackCsv(points) {
  const escape = value => {
    const text = value == null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [
    ['ts', 'lat', 'lon', 'speed'].join(','),
    ...points.map(point => [point.ts, point.lat, point.lon, point.speed].map(escape).join(','))
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
