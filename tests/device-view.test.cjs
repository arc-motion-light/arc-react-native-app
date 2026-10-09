const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { canonicalDeviceNodes, deviceView, scheduleRing } = require('../src/cloud/deviceView.ts');
const { isCurrentArcLamp } = require('../src/arc/arcDeviceAdmission.ts');
const { portalHistoryToLampLogs } = require('../src/cloud/portalTelemetry.ts');
const access = { isOwner: false, canViewTelemetry: true, canViewHistory: true, canTrack: false, canControl: false, canEditSettings: false, canShare: false };
const device = (type = 'lamp', flags = {}, id = 'device-1') => ({ id, type, displayName: 'Family device', owner: { uid: 'father', displayName: 'Father' }, access: { ...access, ...flags }, freshness: 'live', latestTelemetry: {
  sampledAt: '2026-10-05T07:00:00Z', values: { lamp_core_temp_c: 42, lamp_board_temp_c: 30, lamp_power_w: 25, lamp_output_enabled: true, sht45_temp_c: 22 },
} });
const local = (type = 'lamp', connected = true) => ({ id: 'device-1', name: 'Nearby device', nodeKind: type, provisioned: true, connected, color: '', abbreviation: '', lastSeen: Date.parse('2026-10-05T06:00:00Z'), status: { power: true, tempHeatsink: 44 }, probeStatus: { updatedAt: Date.now(), temperatureC: 24 } });
for (const kind of ['lamp', 'probe']) for (const isOwner of [true, false]) {
  test(`${isOwner ? 'owned' : 'shared'} ${kind} enters the canonical selector without BLE`, () => {
    const cloud = device(kind, { isOwner });
    const nodes = canonicalDeviceNodes([], [cloud], kind);
    assert.equal(nodes.length, 1); assert.equal(nodes[0].id, cloud.id);
    assert.equal(nodes[0].connected, false); assert.equal(cloud.owner.uid, 'father');
  });
}
test('local and cloud identity are merged once by canonical ID without rewriting ownership', () => {
  const cloud = device(); const nodes = canonicalDeviceNodes([local()], [cloud], 'lamp');
  assert.equal(nodes.length, 1); assert.equal(nodes[0].connected, true);
  assert.equal(deviceView(nodes[0], [cloud], true).owner.uid, 'father');
  assert.equal(cloud.access.isOwner, false);
});
test('Telemetry grants expose the latest scalar state, with cloud provenance even when backend freshness is live', () => {
  const cloud = device(); const view = deviceView(canonicalDeviceNodes([], [cloud], 'lamp')[0], [cloud], true);
  assert.equal(view.lampStatus.tempHeatsink, 42); assert.equal(view.lampStatus.inputPowerWatts, 25);
  assert.equal(view.provenance, 'cloud'); assert.equal(view.sampledAt, Date.parse(cloud.latestTelemetry.sampledAt));
});
test('no Telemetry grant hides state and confirmed configuration even if a response contains them', () => {
  const cloud = device('lamp', { canViewTelemetry: false });
  cloud.confirmedSchedule = { schemaVersion: 3 };
  const view = deviceView(local(), [cloud], true);
  assert.equal(view.lampStatus, null); assert.equal(view.schedule, null);
});
test('missing BLE and stale timestamps preserve latest known cloud data', () => {
  const cloud = device(); const node = local('lamp', false); node.lastSeen = null;
  assert.equal(deviceView(node, [cloud], true).lampStatus.tempHeatsink, 42);
  assert.equal(deviceView(node, [cloud], true).provenance, 'cloud');
});
test('local live and newer local last-known state retain the existing Lamp view', () => {
  const cloud = device(); const node = local();
  assert.equal(deviceView(node, [cloud], true).lampStatus, node.status);
  node.connected = false; node.lastSeen = Date.parse('2026-10-05T08:00:00Z');
  assert.equal(deviceView(node, [cloud], true).lampStatus, node.status);
});
for (const flag of ['canControl', 'canEditSettings']) {
  test(`${flag} requires both the existing grant and a local path; cloud cannot create a path`, () => {
    for (const permitted of [false, true]) for (const connected of [false, true]) {
      const cloud = device('lamp', { [flag]: permitted });
      assert.equal(deviceView(local('lamp', connected), [cloud], true)[flag], permitted && connected);
    }
    assert.equal(deviceView(local(), [device('lamp', { [flag]: true })], false)[flag], false);
  });
}
test('History is independent of Telemetry and Control', () => {
  assert.equal(deviceView(local(), [device('lamp', { canViewHistory: false })], true).canViewHistory, false);
  assert.equal(deviceView(local(), [device('lamp', { canViewTelemetry: false, canViewHistory: true })], true).canViewHistory, true);
  assert.equal(portalHistoryToLampLogs(device('lamp', { canViewHistory: false }), [{ sampledAt: '2026-10-05T07:00:00Z', values: {} }]).length, 0);
});
test('shared Probe gets its permitted cloud sample without local provisioning', () => {
  const cloud = device('probe'); const node = canonicalDeviceNodes([], [cloud], 'probe')[0];
  assert.equal(deviceView(node, [cloud], true).probeStatus.sht45TemperatureC, 22);
});
test('gateway/NB-IoT data uses identical canonical ID and state semantics', () => {
  const cloud = device(); cloud.latestTelemetry.values.source = 'nb_iot_gateway';
  const view = deviceView(canonicalDeviceNodes([], [cloud], 'lamp')[0], [cloud], true);
  assert.equal(view.node.id, cloud.id); assert.equal(view.provenance, 'cloud');
  assert.equal(view.canControl, false); assert.equal(view.canEditSettings, false);
});
test('confirmed schema-3 Schedule maps to the existing ring; missing Schedule is not fabricated', () => {
  const snapshot = { schemaVersion: 3, enabled: true, config: { onMinutes: 420, offMinutes: 1320, eveningStartMinutes: 1170, eveningFadeMinutes: 40, sunriseFadeMinutes: 30, nightFadeMinutes: 20 } };
  assert.deepEqual(scheduleRing(snapshot), { on: 420, off: 1320, hueFadeStart: 1170, hueFadeDuration: 40, morningFade: 30, nightFade: 20 });
  assert.equal(scheduleRing(null), null);
  const cloud = device('lamp', { canEditSettings: true }); cloud.confirmedSchedule = snapshot;
  const view = deviceView(local('lamp', false), [cloud], true);
  assert.equal(view.schedule, snapshot); assert.equal(view.canEditSettings, false);
});
test('revoked canonical devices never become unregistered local devices with implicit write access', () => {
  const known = new Set(['device-1']);
  assert.equal(canonicalDeviceNodes([local()], [], 'lamp', known).length, 0);
  const view = deviceView(local(), [], true, known);
  assert.equal(view.canControl, false); assert.equal(view.canEditSettings, false); assert.equal(view.lampStatus, null);
});
test('Lamp history adapts actual backend metrics into the existing operational graph records', () => {
  const cloud = device(); const rows = portalHistoryToLampLogs(cloud, [cloud.latestTelemetry]);
  assert.equal(rows[0].lampId, cloud.id); assert.equal(rows[0].measured.coreTemperatureC, 42);
  assert.equal(rows[0].derived.inputPowerWatts, 25); assert.equal(rows[0].state.appliedChannelsPercent, null);
  assert.equal(rows[0].provenance.sourcePath, 'portal_canonical');
});
test('command boundary rechecks live grants, rejects remote paths/cache and guards selection changes', async () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  const start = app.indexOf('  const authorizeLampCommand ='); const end = app.indexOf('  const handlePowerToggle', start);
  const source = app.slice(start, end).replace('const authorizeLampCommand =', 'exports.authorize =');
  for (const scenario of ['allowed', 'revoked', 'remote', 'cache', 'switched']) {
    const cloud = device('lamp', { canControl: true }); let calls = 0;
    const sandbox = { exports: {}, isCurrentArcLamp, meshEnabled: true, connected: true, portalInventoryCached: scenario === 'cache',
      currentCloudUserRef: { current: 'test-user' }, knownCanonicalDeviceIdsRef: { current: new Set([cloud.id]) },
      selectedLampViewRef: { current: deviceView(local('lamp', scenario !== 'remote'), [cloud], true) },
      setPortalDevices: () => {}, setStatus: () => {}, portalErrorMessage: String,
    };
    sandbox.portalClient = { device: async () => {
      calls++; if (scenario === 'switched') sandbox.selectedLampViewRef.current = { node: { id: 'another', connected: true } };
      return device('lamp', { canControl: scenario !== 'revoked' });
    } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
    assert.equal(await sandbox.exports.authorize('canControl'), scenario === 'allowed', scenario);
    if (['remote', 'cache'].includes(scenario)) assert.equal(calls, 0);
  }
});
test('every operational/settings handler has a permission boundary and snapshot publication follows accepted local ACKs', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  for (const name of ['handlePowerToggle','applyManualFanControl','prepareManualPwmFrequency','applyManualChannelControl','applyManualSafetyLimit','applyManualPowerTarget','handleSend']) {
    const start = app.indexOf(`  const ${name} = async`);
    assert.match(app.slice(start, start + 220), /await authorizeLampCommand\('can(Control|EditSettings)'\)/, name);
  }
  // The current Schedule UI uses a unified layout rather than a separate remote branch.
  const source = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let clock;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'renderClock') clock = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(clock);
  const definitions = clock.body.statements.filter(statement => ts.isVariableStatement(statement))
    .flatMap(statement => statement.declarationList.declarations)
    .filter(declaration => ['scheduleReadOnly', 'scheduleEditable', 'scheduleSnapshot'].includes(declaration.name.getText(source)))
    .map(declaration => `const ${declaration.name.getText(source)} = ${declaration.initializer.getText(source)};`);
  assert.equal(definitions.length, 3);
  const code = ts.transpileModule(definitions.join('\n') + '\nexports.result = { scheduleReadOnly, scheduleEditable, scheduleSnapshot };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  for (const connected of [false, true]) for (const permitted of [false, true]) {
    const snapshot = { schemaVersion: 3 };
    const sandbox = { exports: {}, Boolean, activeConnected: connected, canConfigureLamp: permitted, selectedLampView: { device: { id: 'synthetic-device' }, schedule: snapshot } };
    vm.runInNewContext(code, sandbox);
    assert.equal(sandbox.exports.result.scheduleEditable, connected && permitted);
    assert.equal(sandbox.exports.result.scheduleReadOnly, !connected);
    assert.equal(sandbox.exports.result.scheduleSnapshot, connected ? null : snapshot);
  }
  const ui = clock.getText(source);
  assert.match(ui, /disabled=\{!scheduleEditable\}/);
  assert.match(ui, /editable=\{scheduleEditable\}/);
  assert.match(app, /canonical\?\.access\.canEditSettings && !portalInventoryCached && selectedLampNode\?\.connected/);
});

test('schedule-save wrapper executes its delegated authorization before configuration or device writes', async () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  const source = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const wanted = ['saveClockSettingsWithEnabled', 'handleSaveClockSettings'];
  const definitions = {};
  const visit = node => {
    if (ts.isVariableDeclaration(node) && wanted.includes(node.name.getText(source))) {
      definitions[node.name.getText(source)] = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const name of wanted) assert.ok(definitions[name], name);
  const code = ts.transpileModule(wanted.map(name => `const ${name} = ${definitions[name]};`).join('\n') + '\nexports.save = handleSaveClockSettings;', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  for (const scenario of ['revoked', 'disconnected', 'no-route', 'allowed']) {
    const events = [];
    const sandbox = {
      exports: {}, timerEnabled: true,
      authorizeLampCommand: async permission => { events.push(permission); return scenario !== 'revoked'; },
      activeConnected: scenario !== 'disconnected', meshEnabled: scenario !== 'no-route',
      selectedLampNode: { id: 'synthetic-lamp' }, onTime: {},
      setStatus: key => events.push(key), t: key => key,
      timeToMinutes: () => { events.push('configuration'); throw new Error('CONFIGURATION_REACHED'); },
      mesh: { setScheduleConfigV3: () => assert.fail('No device writes before authorization/configuration validation') }
    };
    vm.runInNewContext(code, sandbox);
    if (scenario === 'allowed') await assert.rejects(sandbox.exports.save(), /CONFIGURATION_REACHED/);
    else await sandbox.exports.save();
    assert.equal(events[0], 'canEditSettings', scenario);
    assert.equal(events.includes('configuration'), scenario === 'allowed', scenario);
    if (scenario === 'no-route') assert.ok(events.includes('schedule.localRouteRequired'));
  }
});

test('delayed inventory retains the newest known record, while fresh permissions and owner remain authoritative', () => {
  const { mergePortalInventory } = require('../src/cloud/deviceView.ts');
  const newer = device(); const older = device(); older.latestTelemetry = { sampledAt: '2026-10-04T07:00:00Z', values: { lamp_core_temp_c: 15 } };
  older.owner = { uid: 'new-owner', displayName: 'New owner' };
  const merged = mergePortalInventory([newer], [older])[0];
  assert.equal(merged.latestTelemetry.values.lamp_core_temp_c, 42); assert.equal(merged.owner.uid, 'new-owner');
  older.access.canViewTelemetry = false;
  assert.equal(mergePortalInventory([newer], [older])[0].latestTelemetry, undefined);
  assert.equal(mergePortalInventory([newer], []).length, 0);
});
test('explicit registered source IDs bridge canonical and native identities without duplicate rows or guessed names', () => {
  const native = local(); native.id = 'native-uuid';
  const cloud = device(); cloud.telemetrySourceNodeIds = ['native-uuid'];
  const nodes = canonicalDeviceNodes([native], [cloud], 'lamp');
  assert.equal(nodes.length, 1); assert.equal(nodes[0].id, 'native-uuid');
  assert.equal(nodes[0].canonicalDeviceId, cloud.id);
  assert.equal(deviceView(nodes[0], [cloud], true).device.id, cloud.id);
  assert.equal(deviceView(nodes[0], [cloud], true).canControl, false);
  const ambiguous = device('lamp', {}, 'another-canonical'); ambiguous.telemetrySourceNodeIds = ['native-uuid'];
  const { canonicalDeviceForNode } = require('../src/cloud/deviceView.ts');
  assert.equal(canonicalDeviceForNode(native, [cloud, ambiguous]), null);
});

test('registered BLE MAC source merges with canonical Lamp without duplicate selector rows', () => {
  const cloud = device('lamp', {}, 'canonical-lamp');
  cloud.telemetrySourceNodeIds = ['00:80:e1:2a:e4:32'];
  const nearby = { ...local('lamp'), id: '00:80:E1:2A:E4:32', blePeripheralId: '00:80:E1:2A:E4:32', name: 'ARC Lamp' };
  const rows = canonicalDeviceNodes([nearby], [cloud], 'lamp');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, nearby.id);
  assert.equal(rows[0].canonicalDeviceId, cloud.id);
  assert.equal(deviceView(rows[0], [cloud], true).device.id, cloud.id);
});

test('registered BLE MAC source merges with canonical Probe without a phantom second Probe', () => {
  const cloud = device('probe', {}, 'canonical-probe');
  cloud.telemetrySourceNodeIds = ['aa-bb-cc-dd-ee-ff'];
  const nearby = { ...local('probe'), id: 'AA:BB:CC:DD:EE:FF', blePeripheralId: 'AA:BB:CC:DD:EE:FF', name: 'ARC Probe T' };
  const rows = canonicalDeviceNodes([nearby], [cloud], 'probe');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].canonicalDeviceId, cloud.id);
});

test('same display name is not identity proof and must never merge unrelated devices', () => {
  const cloud = device('lamp', {}, 'canonical-lamp');
  cloud.displayName = 'ARC Lamp';
  const nearby = { ...local('lamp'), id: '00:80:E1:2A:E4:32', blePeripheralId: '00:80:E1:2A:E4:32', name: 'ARC Lamp' };
  const rows = canonicalDeviceNodes([nearby], [cloud], 'lamp');
  assert.equal(rows.length, 2);
  assert.equal(rows.filter(node => node.connected).length, 1);
});

test('Android graph plot measures its available flex height and settings sync is idempotent', () => {
  const app = fs.readFileSync('App.tsx', 'utf8');
  assert.match(app, /setGraphMeasuredPlotHeight\(previous => Math\.abs\(previous - measuredHeight\)/);
  assert.match(app, /Platform\.OS === 'android'\s*\? \{ flex: 1, minHeight: 0 \}/);
  assert.match(app, /Object\.is\(prev\[key\], next\[key\]\)/);
});
