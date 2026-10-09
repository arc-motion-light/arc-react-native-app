import type { DebugRecord } from './debugHistoryMailbox';
import { buildMonotoneSvgPath } from '../graph/historyPlotGeometry';
import type { HistoryPlotPoint, HistoryPlotSeries } from '../graph/HistoryPlot';

export const DEBUG_GRAPH_METRICS = [
  { key: 'ambientTemperatureC', type: 'probe_environment', label: 'Probe temperature', unit: '°C', color: '#f8fafc', family: 'temp' },
  { key: 'ambientHumidityPct', type: 'probe_environment', label: 'Humidity', unit: '%', color: '#38bdf8', family: 'humidity' },
  { key: 'pressureHpa', type: 'probe_environment', label: 'Pressure', unit: 'hPa', color: '#a78bfa', family: 'pressure' },
  { key: 'gasOhms', type: 'probe_environment', label: 'Gas', unit: 'Ω', color: '#fb7185', family: 'gas' },
  { key: 'soilDepth0Raw', type: 'probe_environment', label: 'Soil upper', unit: 'raw', color: '#86efac', family: 'soil' },
  { key: 'soilDepth1Raw', type: 'probe_environment', label: 'Soil middle', unit: 'raw', color: '#22c55e', family: 'soil' },
  { key: 'soilDepth2Raw', type: 'probe_environment', label: 'Soil lower', unit: 'raw', color: '#15803d', family: 'soil' },
  { key: 'soilTemperatureC', type: 'probe_environment', label: 'Soil temperature', unit: '°C', color: '#f59e0b', family: 'temp' },
  { key: 'lightIntensityRaw', type: 'probe_environment', label: 'Light intensity', unit: 'raw', color: '#fde68a', family: 'light' },
  { key: 'batteryPct', type: 'probe_environment', label: 'Probe battery', unit: '%', color: '#facc15', family: 'battery' },
  { key: 'coreTemperatureC', type: 'lamp_operational', label: 'Lamp core', unit: '°C', color: '#fb7185', family: 'temp' },
  { key: 'boardTemperatureC', type: 'lamp_operational', label: 'Lamp board', unit: '°C', color: '#fda4af', family: 'temp' },
  { key: 'mcuTemperatureC', type: 'lamp_operational', label: 'Lamp MCU', unit: '°C', color: '#f472b6', family: 'temp' },
  { key: 'currentMa', type: 'lamp_operational', label: 'Current', unit: 'mA', color: '#c4b5fd', family: 'current' },
  { key: 'powerWatts', type: 'lamp_operational', label: 'Power', unit: 'W', color: '#fbbf24', family: 'power' },
  { key: 'fan1Rpm', type: 'lamp_operational', label: 'Fan 1', unit: 'RPM', color: '#60a5fa', family: 'rpm' },
  { key: 'appliedOutput', type: 'lamp_operational', label: 'Lamp output', unit: '%', color: '#86efac', family: 'output' },
  { key: 'fan2Rpm', type: 'lamp_operational', label: 'Fan 2', unit: 'RPM', color: '#93c5fd', family: 'rpm' },
] as const;
export type DebugMetric = typeof DEBUG_GRAPH_METRICS[number]['key'];
export const debugMetricValue = (row: DebugRecord, key: string): number | null => {
  if (key === 'appliedOutput' && row.record.recordType === 'lamp_operational') {
    const channels = row.record.appliedChannelsPercent;
    return channels.length && channels.every(Number.isFinite) ? channels.reduce((total, value) => total + value, 0) / channels.length : null;
  }
  const value = (row.record as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
export function buildDebugHistoryGraph(rows: readonly DebugRecord[], keys: readonly DebugMetric[], width: number, height: number) {
  const times = rows.filter(row => row.record.timestampValid).map(row => row.record.unixTimeSeconds * 1000);
  const minimumTime = times.length ? Math.min(...times) : 0;
  const maximumTime = times.length ? Math.max(...times) : minimumTime;
  const timeSpan = Math.max(1, maximumTime - minimumTime);
  const sourceSequences = new Set(rows.map(row => row.record.sequence));
  const specs = DEBUG_GRAPH_METRICS.filter(metric => keys.includes(metric.key));
  const bounds = new Map<string, { min: number; max: number }>();
  specs.forEach(metric => {
    const values = rows.filter(row => row.record.recordType === metric.type && row.record.timestampValid)
      .map(row => debugMetricValue(row, metric.key)).filter((value): value is number => value !== null);
    if (!values.length) return;
    const old = bounds.get(metric.family);
    bounds.set(metric.family, { min: Math.min(old?.min ?? Infinity, ...values), max: Math.max(old?.max ?? -Infinity, ...values) });
  });
  const series: HistoryPlotSeries[] = [];
  for (const metric of specs) {
    const sources = new Set(rows.filter(row => row.record.recordType === metric.type)
      .map(row => row.record.recordType === 'probe_environment' ? row.record.probeIndex : -1));
    for (const source of sources) {
      const range = bounds.get(metric.family); if (!range) continue;
      const points: HistoryPlotPoint[] = []; const segments: HistoryPlotPoint[][] = [];
      let segment: HistoryPlotPoint[] = []; let previousSequence: number | null = null;
      const signalKey = `${metric.key}:${source}`;
      for (const row of rows) {
        if (row.record.recordType !== metric.type || (row.record.recordType === 'probe_environment' && row.record.probeIndex !== source)) continue;
        const value = debugMetricValue(row, metric.key);
        let gap = false;
        if (previousSequence !== null) {
          for (let sequence = previousSequence + 1; sequence < row.record.sequence; sequence++) {
            if (!sourceSequences.has(sequence)) { gap = true; break; }
          }
        }
        previousSequence = row.record.sequence;
        if (gap || !row.record.timestampValid || value === null) {
          if (segment.length) segments.push(segment); segment = [];
          if (!row.record.timestampValid || value === null) continue;
        }
        const point: HistoryPlotPoint = {
          id: `${signalKey}:${row.record.sequence}`, signalKey, sequence: row.record.sequence,
          xPx: 4 + ((row.record.unixTimeSeconds * 1000 - minimumTime) / timeSpan) * Math.max(width - 8, 1),
          yPx: 4 + (1 - (value - range.min) / Math.max(range.max - range.min, 1)) * Math.max(height - 8, 1),
          value, timeLabel: '', // format only the selected record in the inspector, not every chart point
        };
        points.push(point); segment.push(point);
      }
      if (segment.length) segments.push(segment);
      series.push({ signalKey, meta: { ...metric, label: source >= 0 ? `${metric.label} · Probe ${source}` : metric.label },
        points, path: segments.map(buildMonotoneSvgPath).join(' ') });
    }
  }
  return { series, minimumTime, maximumTime };
}
