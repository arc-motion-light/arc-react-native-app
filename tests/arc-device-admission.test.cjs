const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { arcAdvertisementRole, isArcScanCandidate, isCurrentArcLamp, isLegacyMeshNode } = require('../src/arc/arcDeviceAdmission.ts');
const lamp = { id: '00:80:E1:2A:E4:32', name: 'Desk light', nodeKind: 'lamp', provisioned: true, connected: false, blePeripheralId: '00:80:E1:2A:E4:32' };
test('unknown advertisements and Nordic provisioner are never Lamp role hints', () => {
  for (const name of [null, '', 'nRF Mesh Provisioner', 'Other Lamp', 'Temperature Sensor', 'Gateway', 'ARC Lampshade']) {
    assert.equal(arcAdvertisementRole(name), 'other', name);
  }
  assert.equal(arcAdvertisementRole('ARC Lamp'), 'lamp');
  assert.equal(arcAdvertisementRole('ARC Probe 2'), 'probe');
  assert.equal(arcAdvertisementRole('ARC Gateway'), 'gateway');
});
test('name alone cannot admit a discovered ARC device; native current-role discovery evidence is required', () => {
  assert.equal(isArcScanCandidate({ id: lamp.id, name: 'ARC Lamp' }), false);
  assert.equal(isArcScanCandidate({ id: lamp.id, name: 'ARC Lamp', arcLocalRoleAdvertised: true }), true);
  assert.equal(isArcScanCandidate({ id: lamp.id, name: 'Other Lamp', arcLocalRoleAdvertised: true }), false);
  assert.equal(isArcScanCandidate({ id: 'legacy', name: 'ARC Lamp', arcLocalRoleAdvertised: true, uuid: 'mesh-uuid' }), false);
});
test('an ARC name and provisioned flag alone cannot make a Lamp selectable', () => {
  assert.equal(isCurrentArcLamp({ ...lamp, name: 'ARC Lamp', blePeripheralId: null }), false);
  assert.equal(isCurrentArcLamp({ ...lamp, provisioned: false }), false);
  assert.equal(isCurrentArcLamp({ ...lamp, nodeKind: 'probe' }), false);
});
test('validated physical identity survives custom display names and an offline restore', () => {
  assert.equal(isCurrentArcLamp(lamp), true);
  assert.equal(isCurrentArcLamp({ ...lamp, name: 'Reading corner', connected: false }), true);
});
test('cached legacy selection is quarantined even when old flags or status claim it is a Lamp', () => {
  const legacy = { ...lamp, id: 'FDA0CA7D-098E-4138-94B3-6B01EBEA133D', name: 'nRF Mesh Provisioner', uuid: 'FDA0CA7D-098E-4138-94B3-6B01EBEA133D', status: { power: true } };
  const snapshot = JSON.stringify(legacy);
  assert.equal(isLegacyMeshNode(legacy), true);
  assert.equal(isCurrentArcLamp(legacy), false);
  assert.equal(JSON.stringify(legacy), snapshot); // admission must not erase durable records
  assert.equal(isCurrentArcLamp({ ...lamp, unicastAddress: 1 }), false);
});

test('previously WBA-validated BLE identity survives a renamed advertisement without admitting strangers', () => {
  const renamed = { id: lamp.id, blePeripheralId: lamp.id, name: 'Reading corner', nodeKind: 'lamp', arcPreviouslyValidated: true };
  assert.equal(isArcScanCandidate(renamed), true);
  assert.equal(isArcScanCandidate({ ...renamed, arcPreviouslyValidated: false }), false);
  assert.equal(isArcScanCandidate({ ...renamed, blePeripheralId: '00:00:00:00:00:00' }), false);
  assert.equal(isArcScanCandidate({ ...renamed, nodeKind: 'other' }), false);
  assert.equal(isArcScanCandidate({ ...renamed, uuid: 'mesh-uuid' }), false);
});
