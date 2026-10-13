const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const protocol = require('../src/mesh/lampCadenceProtocol.ts');
const history = require('../src/mesh/arcHistoryProtocol.ts');
test('all ten intervals and versioned little-endian READ/SET', () => {
  assert.deepEqual(protocol.LAMP_TELEMETRY_INTERVALS, [60,120,180,240,300,360,420,480,540,600]);
  for (const seconds of protocol.LAMP_TELEMETRY_INTERVALS) {
    const frame = protocol.encodeLampCadence(0x12345678, seconds, 0xabcdef01);
    assert.equal(frame.length, 12); assert.equal(frame[0], 0x75);
    const view = new DataView(frame.buffer);assert.equal(view.getUint16(6,true),seconds);assert.equal(view.getUint32(8,true),0xabcdef01);
  }
  assert.equal(protocol.encodeLampCadence(1).length,6);
  for (const seconds of [0,1,59,61,601,900,65536,NaN]) assert.throws(() => protocol.encodeLampCadence(1,seconds,0));
});
test('confirmation requires effective hardware reply; SET requires persisted in client', () => {
  const frame = new Uint8Array(16);frame.set([0x76,1,0,7]);new DataView(frame.buffer).setUint16(8,300,true);
  assert.equal(protocol.decodeLampCadence(frame).persisted,true);
  frame[3]=3;assert.throws(()=>protocol.decodeLampCadence(frame));
  frame[3]=6;assert.equal(protocol.decodeLampCadence(frame).persisted,false);
  frame[2]=3;assert.equal(protocol.decodeLampCadence(frame).status,3);
  for (const size of [0,15,17])assert.throws(()=>protocol.decodeLampCadence(new Uint8Array(size)));
});
test('existing 30-byte history status reports independent Lamp interval compatibly', () => {
  const frame = new Uint8Array(30);frame.set([0x63,2,3,2,32,0]);
  frame[24]=44;frame[25]=1;frame[26]=60;frame[28]=2;
  const status=history.decodeArcHistoryStatus(frame);
  assert.equal(status.lampIntervalSeconds,60);assert.equal(status.lampFollowsProbe,false);
  frame[29]=1;assert.equal(history.decodeArcHistoryStatus(frame).lampFollowsProbe,true);
});
test('writes recheck settings grants and UI stores values per Lamp after response', () => {
  const app=fs.readFileSync('App.tsx','utf8');
  const save=app.slice(app.indexOf('  const saveLampCadence ='),app.indexOf('  const renderManual ='));
  assert.match(save,/await authorizeLampCommand\('canEditSettings'\)/);
  assert.match(save,/await mesh.requestLampCadence/);
  const manual=app.slice(app.indexOf('  const renderManual ='),app.indexOf('  const renderClock ='));
  // Local-first authorization is backed by a non-expired native secure receipt;
  // cached Cloud inventory alone must not disable a valid offline permission.
  const permissionStart=app.indexOf('  const canConfigureLamp =');
  assert.ok(permissionStart>=0,'Lamp settings permission gate exists');
  const permission=app.slice(permissionStart,app.indexOf('\n',permissionStart));
  assert.match(permission,/localHardwareGrant\(selectedLampNode\)\?\.device\?\.access\.canEditSettings/);
  assert.match(permission,/iosLampIdentityReady/);
  assert.match(manual,/selectedLampNode\?\.connected && canConfigureLamp && cadenceRead && !cadenceBusy/);
  assert.match(manual,/disabled=\{!cadenceEditable\}/);
  assert.match(manual,/lampCadenceById\[cadenceId\]/);
  assert.match(manual,/cadence.title/);
  assert.doesNotMatch(manual,/hasConnectedProbeLink/);
});
const clientFixture = () => {
  const source=fs.readFileSync('src/mesh/index.ts','utf8');
  const body=source.slice(source.indexOf('  let cadenceNonce ='),source.indexOf('  const emitter = meshModule',source.indexOf('  let cadenceNonce =')));
  let listener, frame;
  const context={...protocol, Date, Error, Uint8Array, Promise, clearTimeout,
    setTimeout:(fn)=>setTimeout(fn,100),
    emitter:{addListener:(_,callback)=>{listener=callback;return {remove:()=>{listener=null;}};}},
    fromBase64:value=>new Uint8Array(Buffer.from(value,'base64')),
    ensureModule:()=>({}),writeLoaderControlQueued:async(_,id,data)=>{frame=data;}};
  const js=ts.transpileModule(`function factory(){${body};return requestLampCadence}; factory()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const client=vm.runInNewContext(js,context);
  return {client, reply:(node,status=0,flags=7,seconds=60,nonceOffset=0)=>{
    const reply=Buffer.alloc(16);reply.set([0x76,1,status,flags]);reply.writeUInt32LE((new DataView(frame.buffer).getUint32(2,true)+nonceOffset)>>>0,4);reply.writeUInt16LE(seconds,8);reply.writeUInt32LE(8,10);
    listener?.({nodeId:node,payloadBase64:reply.toString('base64')});
  },listening:()=>Boolean(listener)};
};
test('actual confirmation client ignores other Lamps and old nonces; BLE write alone is insufficient',async()=>{
  const fixture=clientFixture();let done=false;
  const pending=fixture.client('lamp-a',60,7).then(reply=>{done=true;return reply;});
  fixture.reply('lamp-b');fixture.reply('lamp-a',0,7,60,-1);
  await Promise.resolve();assert.equal(done,false);
  fixture.reply('lamp-a');assert.equal((await pending).revision,8);assert.equal(fixture.listening(),false);
});
test('actual client rejects persistence failure and legacy-firmware timeout',async()=>{
  let fixture=clientFixture();let pending=fixture.client('lamp-a',60,7);fixture.reply('lamp-a',3);await assert.rejects(pending,/status 3/);
  fixture=clientFixture();pending=fixture.client('lamp-a',60,7);fixture.reply('lamp-a',0,6);await assert.rejects(pending,/not persisted/);
  fixture=clientFixture();await assert.rejects(fixture.client('old-lamp'),/timed out/);assert.equal(fixture.listening(),false);
});
