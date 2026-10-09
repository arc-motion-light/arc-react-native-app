import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { MeshNode } from '../mesh/meshTypes';
import type { AppTheme } from '../ui/theme';
import { HistoryPlot } from '../graph/HistoryPlot';
import type { HistoryPlotPoint, HistoryPlotSeries } from '../graph/HistoryPlot';
import { DebugHistoryMailbox, debugRecordFields, invalidDebugFields } from './debugHistoryMailbox';
import type { DebugRecord } from './debugHistoryMailbox';
import { buildDebugHistoryGraph, DEBUG_GRAPH_METRICS } from './debugHistoryGraph';
import type { DebugMetric } from './debugHistoryGraph';

const HEADER_HEIGHT = 58;
const DRAWER_BOTTOM = 58;
const PLOT_REVEAL_MS = 40;

const LIGHT_METRIC_COLORS: Partial<Record<DebugMetric, string>> = {
  ambientTemperatureC: '#334155',
  ambientHumidityPct: '#0284c7',
  pressureHpa: '#7c3aed',
  gasOhms: '#e11d48',
  soilDepth0Raw: '#16a34a',
  soilDepth1Raw: '#15803d',
  soilDepth2Raw: '#166534',
  soilTemperatureC: '#d97706',
  lightIntensityRaw: '#ca8a04',
  batteryPct: '#a16207',
  coreTemperatureC: '#e11d48',
  boardTemperatureC: '#be123c',
  mcuTemperatureC: '#db2777',
  currentMa: '#7c3aed',
  powerWatts: '#d97706',
  fan1Rpm: '#2563eb',
  appliedOutput: '#16a34a',
  fan2Rpm: '#1d4ed8',
};

function parseRgb(color: string): [number, number, number] | null {
  const value = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return [
      parseInt(value[1] + value[1], 16),
      parseInt(value[2] + value[2], 16),
      parseInt(value[3] + value[3], 16),
    ];
  }
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  }
  const rgb = value.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function backgroundIsDark(color: string) {
  const rgb = parseRgb(color);
  if (!rgb) return true;
  const [r, g, b] = rgb.map(value => value / 255);
  const linear = [r, g, b].map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]) < 0.45;
}

function DrawerBars({ color, align }: { color: string; align: 'left' | 'right' }) {
  return <View style={[styles.drawerBars, { alignItems: align === 'left' ? 'flex-start' : 'flex-end' }]}>
    <View style={[styles.drawerBar, { width: 19, backgroundColor: color }]} />
    <View style={[styles.drawerBar, { width: 13, backgroundColor: color }]} />
    <View style={[styles.drawerBar, { width: 19, backgroundColor: color }]} />
  </View>;
}

export function DebugHistoryMailboxView({ visible, mailbox, lamps, preferredLampId, sessionState, theme, onClose }: {
  visible: boolean; mailbox: DebugHistoryMailbox; lamps: readonly MeshNode[]; preferredLampId: string | null;
  sessionState: (lampId: string) => Promise<string>; theme: AppTheme; onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState(() => mailbox.snapshot());
  const [lampId, setLampId] = useState<string | null>(preferredLampId);
  const [ready, setReady] = useState('DISCONNECTED');
  const [keys, setKeys] = useState<DebugMetric[]>(['ambientHumidityPct', 'soilDepth1Raw', 'coreTemperatureC']);
  const [plotRows, setPlotRows] = useState<readonly DebugRecord[]>([]);
  const rowsRef = useRef<readonly DebugRecord[]>([]);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  const [sequenceInput, setSequenceInput] = useState('');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightMode, setRightMode] = useState<'diagnostics' | 'record'>('diagnostics');
  const leftAnim = useRef(new Animated.Value(0)).current;
  const rightAnim = useRef(new Animated.Value(0)).current;
  const [plotSize, setPlotSize] = useState({ width: 640, height: 260 });
  const { width } = useWindowDimensions();

  const isDark = useMemo(() => backgroundIsDark(theme.colors.background), [theme.colors.background]);
  const palette = useMemo(() => ({
    background: theme.colors.background,
    text: theme.colors.textPrimary,
    muted: isDark ? '#94a3b8' : '#64748b',
    panel: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)',
    panelSoft: isDark ? 'rgba(30, 41, 59, 0.88)' : 'rgba(248, 250, 252, 0.96)',
    panelSelected: isDark ? 'rgba(57, 121, 212, 0.22)' : 'rgba(57, 121, 212, 0.10)',
    plot: isDark ? '#0b1220' : '#ffffff',
    border: isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(15, 23, 42, 0.13)',
    grid: isDark ? 'rgba(148, 163, 184, 0.17)' : 'rgba(15, 23, 42, 0.09)',
    primary: '#3979d4',
    success: isDark ? '#4ade80' : '#15803d',
    warning: isDark ? '#fbbf24' : '#b45309',
    danger: isDark ? '#fb7185' : '#be123c',
    shadow: '#000000',
  }), [isDark, theme.colors.background, theme.colors.textPrimary]);

  const drawerWidth = Math.max(286, Math.min(352, width * 0.39));

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let previousLock: ScreenOrientation.OrientationLock | null = null;
    void (async () => {
      try {
        previousLock = await ScreenOrientation.getOrientationLockAsync();
        if (active) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        // The Modal still advertises landscape-only orientations below.
      }
    })();
    return () => {
      active = false;
      if (previousLock !== null) void ScreenOrientation.lockAsync(previousLock).catch(() => undefined);
    };
  }, [visible]);

  useEffect(() => {
    Animated.spring(leftAnim, { toValue: leftOpen ? 1 : 0, useNativeDriver: true, damping: 24, stiffness: 260, mass: 0.8 }).start();
  }, [leftAnim, leftOpen]);
  useEffect(() => {
    Animated.spring(rightAnim, { toValue: rightOpen ? 1 : 0, useNativeDriver: true, damping: 24, stiffness: 260, mass: 0.8 }).start();
  }, [rightAnim, rightOpen]);

  useEffect(() => {
    if (!visible) return;
    if (!lampId || !lamps.some(lamp => lamp.id === lampId))
      setLampId(preferredLampId ?? lamps.find(lamp => lamp.connected)?.id ?? lamps[0]?.id ?? null);
  }, [visible, preferredLampId, lamps, lampId]);
  useEffect(() => {
    if (!visible) return;
    const unsubscribe = mailbox.subscribe(setSnapshot);
    const timer = setInterval(() => setSnapshot(mailbox.snapshot()), 250);
    return () => { unsubscribe(); clearInterval(timer); };
  }, [mailbox, visible]);
  useEffect(() => {
    if (!visible || !lampId) return;
    let active = true;
    const check = () => { void sessionState(lampId).then(value => { if (active) setReady(value); }).catch(() => { if (active) setReady('UNKNOWN'); }); };
    check(); const timer = setInterval(check, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [visible, lampId, sessionState]);
  useEffect(() => { rowsRef.current = snapshot.records; }, [snapshot.records]);
  useEffect(() => {
    if (!visible) return;

    // Presentation is deliberately decoupled from transport. History may arrive
    // in packed BLE bursts, but the plot reveals one real physical record at a
    // time so reconstruction feels continuous without slowing ingestion.
    setPlotRows(rowsRef.current);
    const timer = setInterval(() => {
      setPlotRows(current => {
        const available = rowsRef.current;

        // Clear/new-run reset must be reflected immediately.
        if (available.length < current.length) return available;
        if (current.length >= available.length) return current;

        return available.slice(0, current.length + 1);
      });
    }, PLOT_REVEAL_MS);

    return () => clearInterval(timer);
  }, [visible]);
  useEffect(() => {
    // Do not snap the final burst into the graph on COMPLETE/ERROR. Let the
    // presentation queue finish naturally. Clear still empties immediately.
    if (snapshot.records.length === 0) setPlotRows([]);
  }, [snapshot.records.length]);

  const graph = useMemo(() => buildDebugHistoryGraph(plotRows, keys, plotSize.width, plotSize.height), [plotRows, keys, plotSize]);
  const visualSeries = useMemo(() => graph.series.map(series => {
    const key = series.signalKey.split(':')[0] as DebugMetric;
    const metric = DEBUG_GRAPH_METRICS.find(item => item.key === key);
    const color = isDark ? metric?.color : LIGHT_METRIC_COLORS[key] ?? metric?.color;
    return { ...series, meta: { ...series.meta, ...(color ? { color } : {}) } };
  }), [graph.series, isDark]);

  const openLeft = useCallback(() => {
    setRightOpen(false);
    setLeftOpen(true);
  }, []);
  const openRight = useCallback((mode: 'diagnostics' | 'record' = 'diagnostics') => {
    setLeftOpen(false);
    setRightMode(mode);
    setRightOpen(true);
  }, []);
  const selectPoint = useCallback((_series: HistoryPlotSeries, point: HistoryPlotPoint) => {
    if (point.sequence === undefined) return;
    setSelectedSequence(point.sequence);
    setSequenceInput(String(point.sequence));
    openRight('record');
  }, [openRight]);

  const rejectedRecord = snapshot.gaps.find(gap => gap.actual === selectedSequence)?.receivedRecord;
  const selected = snapshot.records.find(row => row.record.sequence === selectedSequence)
    ?? (snapshot.sourceCheck?.record?.record.sequence === selectedSequence ? snapshot.sourceCheck.record : undefined)
    ?? (rejectedRecord ? { record: rejectedRecord, receivedMs: 0, crc: 'OK' as const, invalidFields: invalidDebugFields(rejectedRecord) } : undefined)
    ?? (selectedSequence === null ? snapshot.records.at(-1) : undefined);
  const missingSequence = snapshot.gaps[0]?.expected
    ?? (snapshot.state === 'error' && snapshot.oldest !== null && snapshot.received < snapshot.expected ? snapshot.oldest + snapshot.received : null);
  const canDump = ready === 'SESSION_READY' && !snapshot.busy && lampId !== null;
  const selectedLamp = lamps.find(lamp => lamp.id === lampId);

  const activityLabel = snapshot.state === 'dumping' ? 'Dumping'
    : snapshot.state === 'cancelling' ? 'Cancelling · transport still owned'
      : snapshot.state === 'starting' ? (snapshot.stage === 'acquiring' ? 'Waiting for history transport' : 'Reading FRAM status')
        : snapshot.state === 'error' ? 'Incomplete / Error'
          : ready === 'SESSION_READY' ? 'Ready' : ready === 'UNKNOWN' ? 'Native history check unavailable' : 'Waiting for Lamp';

  const metricColor = (metric: typeof DEBUG_GRAPH_METRICS[number]) => isDark
    ? metric.color
    : LIGHT_METRIC_COLORS[metric.key] ?? metric.color;

  const actionButton = (label: string, action: () => void, disabled = false, secondary = false) => <TouchableOpacity
    accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action}
    style={[
      styles.actionButton,
      { backgroundColor: secondary ? palette.panelSoft : palette.primary, borderColor: secondary ? palette.border : palette.primary },
      disabled && styles.disabled,
    ]}>
    <Text style={[styles.actionButtonText, { color: secondary ? palette.text : '#ffffff' }]}>{label}</Text>
  </TouchableOpacity>;

  const stat = (label: string, value: string, tone?: 'warning' | 'danger' | 'success') => <View style={[styles.statRow, { borderBottomColor: palette.border }]}>
    <Text style={[styles.statLabel, { color: palette.muted }]}>{label}</Text>
    <Text style={[styles.statValue, { color: tone === 'warning' ? palette.warning : tone === 'danger' ? palette.danger : tone === 'success' ? palette.success : palette.text }]}>{value}</Text>
  </View>;

  const renderDiagnostics = () => <>
    <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Performance</Text>
    {stat('First record', snapshot.firstRecordMs === null ? '—' : `${snapshot.firstRecordMs.toFixed(0)} ms`)}
    {stat('Stream', snapshot.streamRate > 0 ? `${snapshot.streamRate.toFixed(1)} rec/s` : '—')}
    {stat('Total', `${(snapshot.elapsedMs / 1000).toFixed(2)} s`)}
    {stat('Average', `${snapshot.averageRate.toFixed(1)} rec/s`)}

    <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Transport</Text>
    {stat('Passes', String(snapshot.batches))}
    {stat('Oldest', snapshot.oldest === null ? '—' : String(snapshot.oldest))}
    {stat('Frozen head', snapshot.frozenHead === null ? '—' : String(snapshot.frozenHead))}
    {stat('Between passes', `${snapshot.interBatchGapTotalMs.toFixed(1)} ms total`)}
    {stat('Max pass gap', `${snapshot.interBatchGapMaxMs.toFixed(1)} ms`)}

    <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Continuity</Text>
    {stat('Sequence gaps', String(snapshot.sequenceGaps), snapshot.sequenceGaps ? 'danger' : 'success')}
    {stat('Duplicates', String(snapshot.duplicates), snapshot.duplicates ? 'danger' : 'success')}
    {stat('Out of order', String(snapshot.outOfOrder), snapshot.outOfOrder ? 'danger' : 'success')}
    {stat('Timestamp gaps', String(snapshot.timestampGaps), snapshot.timestampGaps ? 'warning' : 'success')}
    {stat('Field warnings', String(snapshot.invalidFields), snapshot.invalidFields ? 'warning' : undefined)}

    {snapshot.error ? <View style={[styles.notice, { backgroundColor: palette.panelSoft, borderColor: palette.danger }]}>
      <Text style={[styles.noticeText, { color: palette.danger }]}>{snapshot.error}</Text>
    </View> : null}

    {snapshot.gaps.map(gap => <View key={`${gap.expected}:${gap.actual}`} style={[styles.notice, { backgroundColor: palette.panelSoft, borderColor: palette.danger }]}>
      <Text style={[styles.noticeText, { color: palette.text }]}>Missing {gap.expected}..{gap.actual - 1}; received {gap.actual}.</Text>
      <Text style={[styles.noticeSubtext, { color: palette.muted }]}>Source presence is unconfirmed; this capture alone cannot distinguish FRAM absence from receive loss.</Text>
    </View>)}

    {missingSequence !== null ? <View style={styles.drawerActionRow}>
      {actionButton('Check missing sequence in FRAM', () => { void mailbox.verifyMissingSequence(missingSequence); }, snapshot.busy || ready !== 'SESSION_READY')}
    </View> : null}

    {snapshot.sourceCheck ? <View style={[styles.notice, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
      <Text style={[styles.noticeText, { color: palette.text }]}>Source check {snapshot.sourceCheck.sequence}</Text>
      <Text style={[styles.noticeSubtext, { color: palette.muted }]}>{snapshot.sourceCheck.outcome.replace(/_/g, ' ')}</Text>
      <Text style={[styles.noticeSubtext, { color: palette.muted }]}>Current source {snapshot.sourceCheck.currentOldest ?? '—'}..{snapshot.sourceCheck.currentHead ?? '—'}</Text>
      <Text style={[styles.noticeSubtext, { color: palette.muted }]}>{snapshot.sourceCheck.detail ?? 'Verification does not repair or normalize the original capture.'}</Text>
      {snapshot.sourceCheck.record ? <View style={styles.drawerActionRow}>
        {actionButton('Inspect source record', () => {
          setSelectedSequence(snapshot.sourceCheck!.record!.record.sequence);
          setSequenceInput(String(snapshot.sourceCheck!.record!.record.sequence));
          setRightMode('record');
        })}
      </View> : null}
    </View> : null}
  </>;

  const renderRecordInspector = () => <>
    <View style={styles.inspectRow}>
      <TextInput accessibilityLabel="Inspect sequence" placeholder="Sequence" placeholderTextColor={palette.muted}
        keyboardType="number-pad" value={sequenceInput} onChangeText={setSequenceInput}
        style={[styles.input, { color: palette.text, backgroundColor: palette.panelSoft, borderColor: palette.border }]} />
      {actionButton('Inspect', () => setSelectedSequence(Number(sequenceInput)))}
    </View>
    {selected ? <>
      <View style={[styles.recordSummary, { backgroundColor: palette.panelSoft, borderColor: palette.border }]}>
        <Text style={[styles.recordSequence, { color: palette.text }]}>Sequence {selected.record.sequence}</Text>
        <Text style={[styles.recordMeta, { color: palette.muted }]}>{selected.record.recordType} · schema {selected.record.schemaVersion} · run {selected.runId ?? snapshot.debugRunId}</Text>
        <Text style={[styles.recordMeta, { color: palette.muted }]}>{selected.record.timestampValid ? new Date(selected.record.unixTimeSeconds * 1000).toLocaleString() : 'Timestamp unavailable'}</Text>
        <Text style={[styles.recordMeta, { color: palette.success }]}>{selected.record.recordType === 'probe_environment' ? `Stored Probe index ${selected.record.probeIndex} · ` : 'Lamp · '}CRC OK · Decode OK</Text>
      </View>
      {Object.entries(debugRecordFields(selected.record)).map(([key, value]) => {
        const missing = selected.invalidFields.includes(key);
        const metric = DEBUG_GRAPH_METRICS.find(item => item.key === key || (key === 'appliedChannelsPercent' && item.key === 'appliedOutput'));
        const point = metric ? graph.series.some(series => series.signalKey.startsWith(`${metric.key}:`) && series.points.some(p => p.sequence === selected.record.sequence)) : null;
        const graphStatus = metric
          ? !keys.includes(metric.key) ? 'not selected'
            : point ? 'point constructed'
              : !plotRows.some(row => row.record.sequence === selected.record.sequence) && snapshot.records.some(row => row.record.sequence === selected.record.sequence) ? 'pending refresh'
                : 'NO point'
          : null;
        return <View key={key} style={[styles.fieldRow, { borderBottomColor: palette.border }]}>
          <Text style={[styles.fieldKey, { color: missing ? palette.warning : palette.muted }]}>{key}</Text>
          <Text style={[styles.fieldValue, { color: missing ? palette.warning : palette.text }]} numberOfLines={3}>
            {value === null || value === undefined ? 'missing/null' : typeof value === 'object' ? JSON.stringify(value) : String(value)}
            {graphStatus ? ` · graph ${graphStatus}` : ''}
          </Text>
        </View>;
      })}
    </> : <Text style={[styles.drawerEmpty, { color: palette.muted }]}>
      {selectedSequence !== null && snapshot.records.length ? `Sequence ${selectedSequence} is absent from this capture.` : 'Select a graph point or enter a sequence.'}
    </Text>}
  </>;

  return <Modal visible={visible} presentationStyle="fullScreen" animationType="fade" onRequestClose={onClose}
    supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}>
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { height: HEADER_HEIGHT, borderBottomColor: palette.border, backgroundColor: palette.background }]}>
        <View style={styles.headerIdentity}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close History Diagnostics" onPress={onClose}
            style={[styles.closeButton, { borderColor: palette.border, backgroundColor: palette.panelSoft }]}>
            <Text style={[styles.closeButtonText, { color: palette.text }]}>Close</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={[styles.title, { color: palette.text }]}>History Diagnostics</Text>
            <Text style={[styles.headerMeta, { color: snapshot.state === 'error' ? palette.danger : palette.muted }]} numberOfLines={1}>
              {selectedLamp?.name ?? 'ARC Lamp'} · {activityLabel}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {actionButton('Full FRAM Dump', () => {
            if (!lampId) return;
            setSelectedSequence(null); setSequenceInput(''); setRightOpen(false); setLeftOpen(false);
            void mailbox.start(lampId).catch(() => undefined);
          }, !canDump)}
          {actionButton('Clear', () => {
            mailbox.clear(); setSelectedSequence(null); setSequenceInput('');
          }, false, true)}
        </View>
      </View>

      <View style={styles.graphShell}>
        <View style={[styles.plotFrame, { backgroundColor: palette.plot, borderColor: palette.border }]}>
          <View style={styles.plotCanvas} onLayout={event => {
            const next = event.nativeEvent.layout;
            const nextWidth = Math.max(220, Math.round(next.width));
            const nextHeight = Math.max(180, Math.round(next.height));
            setPlotSize(previous => previous.width === nextWidth && previous.height === nextHeight ? previous : { width: nextWidth, height: nextHeight });
          }}>
            <View style={[styles.grid, { top: 4, backgroundColor: palette.grid }]} />
            <View style={[styles.grid, { top: '50%', backgroundColor: palette.grid }]} />
            <View style={[styles.grid, { bottom: 4, backgroundColor: palette.grid }]} />
            <HistoryPlot width={plotSize.width} height={plotSize.height} series={visualSeries} onSelect={selectPoint} maxInteractivePoints={96} />
            {!visualSeries.some(series => series.points.length) ? <View style={styles.emptyState} pointerEvents="none">
              <Text style={[styles.emptyTitle, { color: palette.text }]}>History will appear here</Text>
              <Text style={[styles.emptySubtitle, { color: palette.muted }]}>Run a full FRAM dump to reconstruct the retained timeline.</Text>
            </View> : null}
            <View style={[styles.counterBadge, { backgroundColor: palette.panel, borderColor: palette.border }]} pointerEvents="none">
              <Text style={[styles.counter, { color: palette.text }]}>{snapshot.received} / {snapshot.expected}</Text>
            </View>
            {ready !== 'SESSION_READY' ? <View style={[styles.readinessBadge, { backgroundColor: palette.panel, borderColor: palette.border }]} pointerEvents="none">
              <Text style={[styles.readinessText, { color: ready === 'UNKNOWN' ? palette.warning : palette.muted }]}>{ready === 'UNKNOWN'
                ? 'Native history session check unavailable'
                : 'Connect the Lamp and wait for Loader TX'}</Text>
            </View> : null}
          </View>
          <View style={styles.axisRow} pointerEvents="none">
            <Text style={[styles.axisText, { color: palette.muted }]}>{graph.minimumTime ? new Date(graph.minimumTime).toLocaleString() : '—'}</Text>
            <Text style={[styles.axisText, { color: palette.muted }]}>{graph.maximumTime ? new Date(graph.maximumTime).toLocaleString() : '—'}</Text>
          </View>
        </View>

        <Animated.View pointerEvents={leftOpen ? 'auto' : 'none'} style={[
          styles.drawer,
          styles.leftDrawer,
          { width: drawerWidth, top: 10, bottom: DRAWER_BOTTOM, backgroundColor: palette.panel, borderColor: palette.border,
            transform: [{ translateX: leftAnim.interpolate({ inputRange: [0, 1], outputRange: [-drawerWidth - 26, 0] }) }] },
        ]}>
          <View style={[styles.drawerHeader, { borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>Variables</Text>
              <Text style={[styles.drawerSubtitle, { color: palette.muted }]}>{keys.length} selected</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Variables" onPress={() => setLeftOpen(false)} style={styles.drawerClose}>
              <Text style={[styles.drawerCloseText, { color: palette.muted }]}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
            {lamps.length > 1 ? <>
              <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Source</Text>
              {lamps.map(lamp => {
                const selectedSource = lamp.id === lampId;
                return <TouchableOpacity key={lamp.id} disabled={snapshot.busy} onPress={() => setLampId(lamp.id)}
                  style={[styles.variableRow, { borderBottomColor: palette.border, backgroundColor: selectedSource ? palette.panelSelected : 'transparent' }]}>
                  <View style={[styles.sourceDot, { backgroundColor: lamp.connected ? palette.success : palette.muted }]} />
                  <Text style={[styles.variableLabel, { color: palette.text }]} numberOfLines={1}>{lamp.name}</Text>
                  {selectedSource ? <Text style={[styles.selectedMark, { color: palette.primary }]}>✓</Text> : null}
                </TouchableOpacity>;
              })}
            </> : null}

            <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Probe</Text>
            {DEBUG_GRAPH_METRICS.filter(metric => metric.type === 'probe_environment').map(metric => {
              const selectedMetric = keys.includes(metric.key);
              return <TouchableOpacity key={metric.key} onPress={() => setKeys(previous => selectedMetric ? previous.filter(key => key !== metric.key) : [...previous, metric.key])}
                style={[styles.variableRow, { borderBottomColor: palette.border, backgroundColor: selectedMetric ? palette.panelSelected : 'transparent' }]}>
                <View style={[styles.metricDot, { backgroundColor: metricColor(metric) }]} />
                <Text style={[styles.variableLabel, { color: palette.text }]}>{metric.label}</Text>
                <Text style={[styles.variableUnit, { color: palette.muted }]}>{metric.unit}</Text>
                {selectedMetric ? <Text style={[styles.selectedMark, { color: palette.primary }]}>✓</Text> : null}
              </TouchableOpacity>;
            })}

            <Text style={[styles.drawerSectionTitle, { color: palette.text }]}>Lamp</Text>
            {DEBUG_GRAPH_METRICS.filter(metric => metric.type === 'lamp_operational').map(metric => {
              const selectedMetric = keys.includes(metric.key);
              return <TouchableOpacity key={metric.key} onPress={() => setKeys(previous => selectedMetric ? previous.filter(key => key !== metric.key) : [...previous, metric.key])}
                style={[styles.variableRow, { borderBottomColor: palette.border, backgroundColor: selectedMetric ? palette.panelSelected : 'transparent' }]}>
                <View style={[styles.metricDot, { backgroundColor: metricColor(metric) }]} />
                <Text style={[styles.variableLabel, { color: palette.text }]}>{metric.label}</Text>
                <Text style={[styles.variableUnit, { color: palette.muted }]}>{metric.unit}</Text>
                {selectedMetric ? <Text style={[styles.selectedMark, { color: palette.primary }]}>✓</Text> : null}
              </TouchableOpacity>;
            })}
          </ScrollView>
        </Animated.View>

        <Animated.View pointerEvents={rightOpen ? 'auto' : 'none'} style={[
          styles.drawer,
          styles.rightDrawer,
          { width: drawerWidth, top: 10, bottom: DRAWER_BOTTOM, backgroundColor: palette.panel, borderColor: palette.border,
            transform: [{ translateX: rightAnim.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth + 26, 0] }) }] },
        ]}>
          <View style={[styles.drawerHeader, { borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.drawerTitle, { color: palette.text }]}>{rightMode === 'diagnostics' ? 'Diagnostics' : 'Record inspector'}</Text>
              <Text style={[styles.drawerSubtitle, { color: palette.muted }]}>{rightMode === 'diagnostics' ? `Run ${snapshot.debugRunId}` : selectedSequence === null ? 'No sequence selected' : `Sequence ${selectedSequence}`}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Diagnostics" onPress={() => setRightOpen(false)} style={styles.drawerClose}>
              <Text style={[styles.drawerCloseText, { color: palette.muted }]}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.segmented, { backgroundColor: palette.panelSoft }]}>
            <TouchableOpacity onPress={() => setRightMode('diagnostics')} style={[styles.segment, rightMode === 'diagnostics' && { backgroundColor: palette.panelSelected }]}>
              <Text style={[styles.segmentText, { color: rightMode === 'diagnostics' ? palette.text : palette.muted }]}>Diagnostics</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRightMode('record')} style={[styles.segment, rightMode === 'record' && { backgroundColor: palette.panelSelected }]}>
              <Text style={[styles.segmentText, { color: rightMode === 'record' ? palette.text : palette.muted }]}>Record</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {rightMode === 'diagnostics' ? renderDiagnostics() : renderRecordInspector()}
          </ScrollView>
        </Animated.View>

        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Variables" onPress={() => leftOpen ? setLeftOpen(false) : openLeft()}
          style={[styles.cornerButton, styles.cornerButtonLeft, { backgroundColor: palette.panel, borderColor: leftOpen ? palette.primary : palette.border }]}>
          <DrawerBars color={leftOpen ? palette.primary : palette.text} align="left" />
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open Diagnostics" onPress={() => rightOpen ? setRightOpen(false) : openRight('diagnostics')}
          style={[styles.cornerButton, styles.cornerButtonRight, { backgroundColor: palette.panel, borderColor: rightOpen ? palette.primary : palette.border }]}>
          <DrawerBars color={rightOpen ? palette.primary : palette.text} align="right" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', minWidth: 0, flex: 1 },
  headerTitleBlock: { marginLeft: 11, minWidth: 0, flexShrink: 1 },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: 0.1 },
  headerMeta: { fontSize: 11, marginTop: 2 },
  closeButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  closeButtonText: { fontSize: 12, fontWeight: '600' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12 },
  actionButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 9, borderWidth: 1 },
  actionButtonText: { fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.38 },

  graphShell: { flex: 1, position: 'relative', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8, overflow: 'hidden' },
  plotFrame: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, overflow: 'hidden' },
  plotCanvas: { flex: 1, position: 'relative', minHeight: 180 },
  grid: { position: 'absolute', left: 4, right: 4, height: StyleSheet.hairlineWidth },
  axisRow: { height: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  axisText: { fontSize: 10, fontVariant: ['tabular-nums'] },
emptyState: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingBottom: 18 },  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySubtitle: { fontSize: 11, marginTop: 5 },
  counterBadge: { position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 7 },
  counter: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  readinessBadge: { position: 'absolute', top: 10, left: 10, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  readinessText: { fontSize: 10, fontWeight: '600' },

  drawer: { position: 'absolute', zIndex: 20, borderWidth: 1, borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
  leftDrawer: { left: 10 },
  rightDrawer: { right: 10 },
  drawerHeader: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  drawerTitle: { fontSize: 17, fontWeight: '700' },
  drawerSubtitle: { fontSize: 10, marginTop: 2 },
  drawerClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  drawerCloseText: { fontSize: 25, lineHeight: 27, fontWeight: '300' },
  drawerContent: { padding: 12, paddingBottom: 24 },
  drawerSectionTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 9, marginBottom: 5 },
  drawerActionRow: { marginTop: 10, alignItems: 'flex-start' },
  drawerEmpty: { fontSize: 12, lineHeight: 18, paddingVertical: 18 },

  variableRow: { minHeight: 39, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, borderRadius: 7 },
  metricDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  variableLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  variableUnit: { fontSize: 10, marginLeft: 8 },
  selectedMark: { fontSize: 14, fontWeight: '800', marginLeft: 9 },

  segmented: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, padding: 3, borderRadius: 9 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 30, borderRadius: 7 },
  segmentText: { fontSize: 11, fontWeight: '700' },
  statRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  notice: { borderWidth: 1, borderRadius: 9, padding: 10, marginTop: 10 },
  noticeText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  noticeSubtext: { fontSize: 10, lineHeight: 15, marginTop: 3 },

  inspectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 10 },
  input: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, fontSize: 12 },
  recordSummary: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  recordSequence: { fontSize: 15, fontWeight: '800' },
  recordMeta: { fontSize: 10, lineHeight: 16, marginTop: 2 },
  fieldRow: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  fieldKey: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  fieldValue: { fontSize: 11, lineHeight: 15 },

  cornerButton: { position: 'absolute', bottom: 10, width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', zIndex: 30, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 10 },
  cornerButtonLeft: { left: 18 },
  cornerButtonRight: { right: 18 },
  drawerBars: { width: 20, gap: 3 },
  drawerBar: { height: 2, borderRadius: 2 },
});
