const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const { historyRange, acceptHistorySequence } = require('../src/mesh/arcHistorySession.ts');
const { prepareHistoryUpload, mergeHistoryRecords } = require('../src/cloud/historyGateway.ts');
const status = { ready: true, count: 43, oldestSequence: 470, newestSequence: 512 };
const devices = ['lamp', 'probe'].map(type => ({ id: `canonical-${type}`, type, telemetrySourceNodeIds: [`native-${type}`], access: { canViewTelemetry: true, canViewHistory: true, canControl: false, canEditSettings: false } }));
const record = { recordId: 'lamp:native-lamp:history:490', recordType: 'probe_environment', lampId: 'native-lamp', probeId: 'native-probe', historySequence: 490 };
test('FRAM wrap resumes at oldest, keeps a fixed head and never uses Cloud max to skip gaps', () => {
  assert.deepEqual(historyRange(status, 471), { after: 471, head: 512, overwritten: false });
  assert.deepEqual(historyRange(status, 0), { after: 469, head: 512, overwritten: true });
  assert.equal(historyRange(status, 512), null);
  assert.equal(historyRange({ ...status, count: 0 }, 0), null);
  assert.throws(() => historyRange(status, 513), /regression/);
  const session = historyRange(status, 500);
  assert.equal(acceptHistorySequence(511, session.head, 513), 'beyond_head');
});
test('one-record chunk continuation rejects interleaved, skipped and duplicate responses', () => {
  assert.equal(acceptHistorySequence(490, 512, 491), 'accept');
  assert.equal(acceptHistorySequence(490, 512, 490), 'duplicate');
  assert.equal(acceptHistorySequence(490, 512, 500), 'gap');
  const a = historyRange(status, 471), b = historyRange(status, 500);
  assert.equal(acceptHistorySequence(a.after, a.head, 501), 'gap');
  assert.equal(acceptHistorySequence(b.after, b.head, 501), 'accept');
  assert.equal(status.oldestSequence, 470); // plans/read decisions never mutate bounds
});
test('History alone authorizes a shared gateway without Control or Settings elevation', () => {
  assert.equal(prepareHistoryUpload(record, devices).canonicalProbeId, 'canonical-probe');
  assert.equal(prepareHistoryUpload(record, devices).canonicalLampId, 'canonical-lamp');
  assert.equal(devices[0].access.canControl, false);
  assert.equal(devices[0].access.canEditSettings, false);
  assert.equal(prepareHistoryUpload(record, devices.map(d => ({ ...d, access: { ...d.access, canViewHistory: false } }))), null);
  assert.equal(prepareHistoryUpload({ ...record, probeId: 'unregistered' }, devices), null);
  assert.equal(prepareHistoryUpload({ ...record, lampId: 'device-B' }, devices), null);
});
test('graph keeps newer local routed Probe history and deduplicates cloud copies by canonical sequence', () => {
  const cloud = [{ recordId: 'lamp:canonical-lamp:history:490', value: 'cloud' }];
  const local = [{ recordId: record.recordId, value: 'local' }, { recordId: 'lamp:native-lamp:history:491', value: 'newer' }];
  assert.deepEqual(mergeHistoryRecords(cloud, local, devices).map(r => r.value), ['local', 'newer']);
});
test('native integration gates History, avoids global ACK and bounds transport ownership', () => {
  const app = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');
  const history = app.slice(app.indexOf('const historyQueues ='), app.indexOf('const unsubscribeProvisionState ='));
  assert.ok(!history.includes('acknowledgeHistoryThrough('));
  assert.ok(!history.includes('setTimeEpoch('));
  assert.ok(history.includes('!device?.access.canViewHistory'));
  assert.ok(history.includes('historyStarts.size || historyDrains.size'));
  assert.ok(history.includes('reason=record_timeout'));
  assert.ok(history.includes('downloaded >= HISTORY_BATCH_LIMIT'));
  assert.ok(history.indexOf('await appendProbeLogRecord') < history.indexOf('await saveArcHistoryCursor'));
  assert.ok(history.includes('drain.userId !== currentCloudUserRef.current'));
});
test('existing durable queue survives Cloud failure and retries the same physical record', async () => {
  const Module = require('node:module');
  const original = Module._load;
  const files = new Map();
  const lamp = { recordId: 'lamp:native-lamp:history:490', lampId: 'native-lamp', timeline: { lampSampledAtMs: 1800000000000, receivedAtMs: 1800000001000, timestampOrigin: 'lamp_g4_rtc' } };
  Module._load = function(request, parent, ...rest) {
    if (request === '@react-native-async-storage/async-storage') return { getItem: async () => null, setItem: async () => {} };
    if (request === 'expo-file-system/legacy') return {
      documentDirectory: '/durable/', EncodingType: { UTF8: 'utf8' }, getInfoAsync: async path => ({ exists: files.has(path) }),
      makeDirectoryAsync: async () => {}, readAsStringAsync: async path => files.get(path), writeAsStringAsync: async (path, text) => files.set(path, text)
    };
    if (parent?.filename.endsWith('localTelemetryStore.ts') && request === './lampLogger') return { loadAllLampOperationalRecords: async () => [lamp] };
    if (parent?.filename.endsWith('localTelemetryStore.ts') && request === './probeLogger') return { loadAllProbeLogRecords: async () => [] };
    return original.call(this, request, parent, ...rest);
  };
  let store;
  try { store = require('../src/localTelemetryStore.ts'); } finally { Module._load = original; }
  const failed = await store.drainCloudTelemetry(async () => { throw Error('Cloud offline'); });
  assert.equal(failed.failed, 1);
  assert.equal(JSON.parse(files.get('/durable/arc-local-telemetry/cloud-sync-state.json'))[lamp.recordId].state, 'retry');
  assert.equal(lamp.recordId, 'lamp:native-lamp:history:490');
  await store.retryCloudTelemetryNow();
  const success = await store.drainCloudTelemetry(async records => ({ acceptedRecordIds: records.map(r => r.recordId) }));
  assert.equal(success.uploaded, 1);
  assert.equal(JSON.parse(files.get('/durable/arc-local-telemetry/cloud-sync-state.json'))[lamp.recordId].state, 'synced');
});
