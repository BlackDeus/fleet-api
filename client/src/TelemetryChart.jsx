import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { formatTime, parseMetricValue } from './telemetry';

export default function TelemetryChart({ rows, metric }) {
  const chartRows = rows
    .filter(row => row.metric === metric)
    .map(row => ({
      ts: Number(row.ts),
      time: formatTime(row.ts),
      value: Number(parseMetricValue(row.value))
    }))
    .filter(row => Number.isFinite(row.value))
    .sort((a, b) => a.ts - b.ts);

  const label = metric === 'fuel' ? 'Рівень пального (%)' : 'Швидкість (км/год)';
  return (
    <div className="chart-wrap">
      {chartRows.length === 0 ? (
        <div className="empty-state chart-empty">
          <span className="empty-icon">∿</span>
          <strong>Недостатньо даних для графіка</strong>
          <span>Надішли через MQTT телеметрію з метрикою “{metric}”, щоб побачити історію.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={290}>
          <LineChart data={chartRows} margin={{ top: 8, right: 18, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8edf3" />
            <XAxis dataKey="time" minTickGap={24} tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis width={48} tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip labelFormatter={(value, payload) => payload?.[0]?.payload?.ts ? new Date(payload[0].payload.ts * (payload[0].payload.ts < 1e12 ? 1000 : 1)).toLocaleString() : value} />
            <Legend />
            <Line type="monotone" dataKey="value" name={label} stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
