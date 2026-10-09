const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, filename);
const { applyOwnerConfirmedDeviceLinks, ownerLinkKey, ownerLinkTargets } = require('../src/cloud/ownerConfirmedDeviceLinks.ts');
const { canonicalDeviceNodes, deviceView } = require('../src/cloud/deviceView.ts');
const access = { isOwner:true, canViewTelemetry:true, canViewHistory:true, canTrack:false, canControl:false, canEditSettings:false, canShare:false };
const canonical = (type,id) => ({id, type, displayName: type==='lamp'?'ARC Lamp':'ARC Probe', owner:{uid:'owner-1',displayName:'Owner'}, access:{...access}, freshness:'live', telemetrySourceNodeIds:[] });
const local = (type, id) => ({id, blePeripheralId:id, nodeKind:type, provisioned:true, connected:type==='lamp', name:type==='lamp'?'ARC Lamp':'ARC Probe', abbreviation:'ARC',color:'#fff'});
test('unlinked Android BLE and iOS UUID remain separate; name does not prove identity', () => {
  const native = local('lamp','00:80:E1:2A:E4:32'); const cloud = canonical('lamp','CE092F02-A688-A941-353F-4636EF8AD8AA');
  assert.equal(canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks([native],[cloud],{},'owner-1'),[cloud],'lamp').length,2);
});
for (const kind of ['lamp','probe']) test(`explicit owner-confirmed ${kind} ID pair gives one logical device without rewriting transport ID`, () => {
  const native = local(kind, kind==='lamp'?'00:80:E1:2A:E4:32':'00:80:E1:2A:E7:E9');
  const cloud = canonical(kind,kind==='lamp'?'CE092F02-A688-A941-353F-4636EF8AD8AA':'819907EE-CB8E-78EB-3F8B-DBDE486DBC93');
  const links = {[ownerLinkKey(native)]:cloud.id};
  const rows = canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks([native],[cloud],links,'owner-1'),[cloud],kind);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,native.id);
  assert.equal(rows[0].blePeripheralId,native.id);
  assert.equal(rows[0].canonicalDeviceId,cloud.id);
  assert.equal(deviceView(rows[0],[cloud],true).device.id,cloud.id);
});
test('link never applies to a different account or unowned/shared cloud device', () => {
  const native = local('lamp','00:80:E1:2A:E4:32'); const cloud = canonical('lamp','cloud');
  const links = {[ownerLinkKey(native)]:cloud.id};
  assert.equal(applyOwnerConfirmedDeviceLinks([native],[cloud],links,'stranger')[0].canonicalDeviceId,undefined);
  cloud.access.isOwner=false;
  assert.equal(applyOwnerConfirmedDeviceLinks([native],[cloud],links,'owner-1')[0].canonicalDeviceId,undefined);
  assert.equal(ownerLinkTargets(native,[cloud],'owner-1').length,0);
});
test('revoked or absent ownership, different type, and ambiguous associations fail closed', () => {
  const native = local('probe','00:80:E1:2A:E7:E9'); const cloud = canonical('lamp','cloud');
  const links = {[ownerLinkKey(native)]:cloud.id};
  assert.equal(applyOwnerConfirmedDeviceLinks([native],[cloud],links,'owner-1')[0].canonicalDeviceId,undefined);
  const probe = canonical('probe','cloud');
  assert.equal(applyOwnerConfirmedDeviceLinks([native],[],links,'owner-1')[0].canonicalDeviceId,undefined);
  assert.equal(applyOwnerConfirmedDeviceLinks([native],[probe],{...links,'probe:different-local-id':probe.id},'owner-1')[0].canonicalDeviceId,undefined);
});
test('explicit backend source registration overrides a conflicting local owner assertion', () => {
  const native = local('lamp','00:80:E1:2A:E4:32'); const cloud = canonical('lamp','chosen');
  const actual = canonical('lamp','backend-registered'); actual.telemetrySourceNodeIds = [native.id];
  const linked = applyOwnerConfirmedDeviceLinks([native],[cloud, actual],{[ownerLinkKey(native)]:cloud.id},'owner-1');
  assert.equal(linked[0].canonicalDeviceId,undefined);
  const rows = canonicalDeviceNodes(linked,[cloud,actual],'lamp');
  assert.equal(rows.length,2);
  assert.equal(rows.find(item => item.id===native.id).canonicalDeviceId,'backend-registered');
});

test('device-link keys survive BLE MAC capitalization and separators', () => {
  const first = local('lamp', '00:80:E1:2A:E4:32');
  const formatVariant = { ...first, id: '0080e12ae432', blePeripheralId: '00-80-e1-2a-e4-32' };
  assert.equal(ownerLinkKey(first), ownerLinkKey(formatVariant));
  const cloud = canonical('lamp', 'canonical');
  assert.equal(applyOwnerConfirmedDeviceLinks([formatVariant], [cloud], { [ownerLinkKey(first)]:cloud.id }, 'owner-1')[0].canonicalDeviceId, cloud.id);
});

test('legacy Mesh nodes and nonmatching BLE identity records cannot be locally linked', () => {
  const cloud = canonical('lamp', 'canonical');
  const fake = { ...local('lamp', '00:80:E1:2A:E4:32'), uuid: 'old-nordic-node' };
  const missingBle = { ...local('lamp', '00:80:E1:2A:E4:32'), blePeripheralId: undefined };
  const mismatchedBle = { ...local('lamp', '00:80:E1:2A:E4:32'), blePeripheralId: '00:80:E1:2A:E7:E9' };
  for (const node of [fake, missingBle, mismatchedBle]) {
    assert.equal(ownerLinkTargets(node, [cloud], 'owner-1').length, 0);
    assert.equal(applyOwnerConfirmedDeviceLinks([node], [cloud], {[ownerLinkKey(node)]: cloud.id}, 'owner-1')[0].canonicalDeviceId, undefined);
  }
});

test('multiple owned devices remain explicit separate choices until individually linked', () => {
  const native = local('lamp', '00:80:E1:2A:E4:32');
  const first = canonical('lamp', 'first'); const second = canonical('lamp', 'second');
  assert.deepEqual(ownerLinkTargets(native, [first,second], 'owner-1').map(d => d.id), ['first','second']);
  assert.equal(canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks([native],[first,second],{},'owner-1'),[first,second],'lamp').length, 3);
  assert.equal(canonicalDeviceNodes(applyOwnerConfirmedDeviceLinks([native],[first,second],{[ownerLinkKey(native)]:'second'},'owner-1'),[first,second],'lamp').length, 2);
});

test('two BLE devices cannot claim the same canonical owner device', () => {
  const left = local('lamp', '00:80:E1:2A:E4:32');
  const right = local('lamp', '00:80:E1:2A:E7:E9');
  const cloud = canonical('lamp', 'canonical');
  const links = {[ownerLinkKey(left)]:cloud.id,[ownerLinkKey(right)]:cloud.id};
  const nodes = applyOwnerConfirmedDeviceLinks([left,right], [cloud], links, 'owner-1');
  assert.equal(nodes[0].canonicalDeviceId, undefined);
  assert.equal(nodes[1].canonicalDeviceId, undefined);
});

test('a backend registration with a differently formatted MAC defeats a conflicting local choice', () => {
  const node = local('lamp', '00:80:E1:2A:E4:32');
  const chosen = canonical('lamp', 'chosen');
  const actual = canonical('lamp', 'server'); actual.telemetrySourceNodeIds = ['0080e12ae432'];
  const nodeOut = applyOwnerConfirmedDeviceLinks([node], [chosen, actual], {[ownerLinkKey(node)]:chosen.id}, 'owner-1')[0];
  assert.equal(nodeOut.canonicalDeviceId, undefined);
});

const { validatedOwnerLinkId, linkedHistoryInventory } = require('../src/cloud/ownerConfirmedDeviceLinks.ts');
test('Android requires an explicit account-validated local association before connect', () => {
  const ble = local('lamp', '00:80:E1:2A:E4:32');
  const cloud = canonical('lamp', 'CE092F02-A688-A941-353F-4636EF8AD8AA');
  assert.equal(validatedOwnerLinkId(ble, [cloud], {}, 'owner-1'), null);
  assert.equal(validatedOwnerLinkId(ble, [cloud], {[ownerLinkKey(ble)]:cloud.id}, 'stranger'), null);
  assert.equal(validatedOwnerLinkId(ble, [cloud], {[ownerLinkKey(ble)]:cloud.id}, 'owner-1'), cloud.id);
  cloud.access.isOwner = false;
  assert.equal(validatedOwnerLinkId(ble, [cloud], {[ownerLinkKey(ble)]:cloud.id}, 'owner-1'), null);
});

test('multiple claimed cloud Lamps require individual distinct MAC selections', () => {
  const lampA = local('lamp', '00:80:E1:2A:E4:32'), lampB=local('lamp', '00:80:E1:2A:E4:33');
  const idA = canonical('lamp','cloud-one'), idB=canonical('lamp','cloud-two');
  const links = {[ownerLinkKey(lampA)]: idA.id};
  assert.equal(validatedOwnerLinkId(lampA, [idA,idB], links, 'owner-1'), idA.id);
  assert.equal(validatedOwnerLinkId(lampB, [idA,idB], links, 'owner-1'), null);
  assert.equal(validatedOwnerLinkId(lampB, [idA,idB], {...links,[ownerLinkKey(lampB)]:idA.id}, 'owner-1'), null);
  assert.equal(validatedOwnerLinkId(lampB, [idA,idB], {...links,[ownerLinkKey(lampB)]:idB.id}, 'owner-1'), idB.id);
});

test('history recognizes only an owner-approved BLE alias without altering backend records', () => {
  const lamp = local('lamp', '00:80:E1:2A:E4:32');
  const cloud = canonical('lamp','cloud-id');
  const links = {[ownerLinkKey(lamp)]: cloud.id};
  const result = linkedHistoryInventory([lamp], [cloud], links, 'owner-1');
  assert.ok(result[0].telemetrySourceNodeIds.includes(lamp.id));
  assert.equal(cloud.telemetrySourceNodeIds.length,0);
  assert.equal(linkedHistoryInventory([lamp],[cloud],links,'different-account')[0],cloud);
  cloud.access.isOwner=false;
  assert.equal(linkedHistoryInventory([lamp],[cloud],links,'owner-1')[0],cloud);
});
