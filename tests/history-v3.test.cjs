const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = (m,f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const recovery = require('../src/mesh/arcHistorySession.ts');
const historyProtocol = require('../src/mesh/arcHistoryProtocol.ts');
const planHistoryRecovery = (status, cursor, ranges, cloud) => recovery.planHistoryRecovery(status, cursor, ranges, cloud, 'lamp-A');
const resolveHistoryRecovery = (status, local, enabled, load) => recovery.resolveHistoryRecovery(status, local, enabled, load, 'lamp-A');
const status = (oldest=100,newest=500) => ({ready:true,count:newest-oldest+1,oldestSequence:oldest,newestSequence:newest});
const coverage = (ranges, oldest=100, newest=500, seen=null) => ({ lampId:'lamp-A',streamId:'lamp:lamp-A:history',framOldest:oldest,framNewest:newest,coveredRanges:ranges,contiguousFromFramOldestThrough:ranges[0]?.from===oldest?ranges[0].through:null,newestSeen:seen ?? ranges.at(-1)?.through ?? null });

test('new phone skips only proven Cloud coverage and never uses newestSeen as continuity', () => {
  const a=planHistoryRecovery(status(),0,[],coverage([{from:100,through:400}],100,500,400));
  assert.deepEqual(a.missingRanges,[{from:401,through:500}]); assert.equal(a.after,400);
  const b=planHistoryRecovery(status(),0,[],coverage([{from:100,through:300},{from:302,through:400}],100,500,400));
  assert.deepEqual(b.missingRanges,[{from:301,through:301},{from:401,through:500}]); assert.equal(b.head,301);
});
test('existing phone combines local durability with Cloud islands without changing the local cursor', () => {
  const local={cursor:4750,ranges:[]};
  const plan=planHistoryRecovery(status(4340,4790),local.cursor,local.ranges,coverage([{from:4340,through:4770}],4340,4790,4770));
  assert.equal(plan.after,4770); assert.equal(local.cursor,4750);
  assert.deepEqual(planHistoryRecovery(status(),0,[{from:401,through:450}],coverage([{from:100,through:400}])).missingRanges,[{from:451,through:500}]);
});
test('Pure Local never calls Cloud or uses a remembered coverage value', async () => {
  let calls=0;
  const result=await resolveHistoryRecovery(status(),{cursor:200,ranges:[]},false,async()=>{calls++;return coverage([{from:100,through:500}]);});
  assert.equal(calls,0); assert.equal(result.plan.after,200); assert.equal(result.coverage,null);
});
test('failed handshake falls back to current local cursor and sparse durable ranges', async () => {
  const result=await resolveHistoryRecovery(status(),{cursor:200,ranges:[{from:301,through:350}]},true,async()=>{throw Error('offline');});
  assert.equal(result.coverageError.message,'offline');
  assert.deepEqual(result.plan.missingRanges,[{from:201,through:300},{from:351,through:500}]);
});
test('regression, stale windows and invalid ranges cannot authorize Cloud skips', () => {
  const ahead=planHistoryRecovery(status(),0,[],coverage([{from:100,through:500}],100,500,600));
  assert.equal(ahead.cloudAhead,true); assert.equal(ahead.retryFreshStatus,true); assert.equal(ahead.after,99);
  assert.equal(planHistoryRecovery(status(),0,[],coverage([{from:100,through:400}],100,499)).after,99);
  assert.equal(planHistoryRecovery(status(),0,[],coverage([{from:100,through:501}])).after,99);
  const staleLocal = planHistoryRecovery(status(),600,[]);
  assert.equal(staleLocal.localStateAhead,true); assert.equal(staleLocal.after,99);
});
test('new pass can use another phone advance without chasing a moving FRAM head', () => {
  const initial=planHistoryRecovery(status(),0,[],coverage([{from:100,through:400}]));
  const next=planHistoryRecovery(status(),0,[{from:401,through:425}],coverage([{from:100,through:450}]));
  assert.equal(initial.head,500); assert.equal(next.after,450);
  assert.equal(initial.head,500); // prior session remains immutable
});

test('packed BLE history validates and decodes ordered records without weakening physical CRC checks', () => {
  const makeRecord = sequence => {
    const raw = new Uint8Array(32);
    raw[0] = 0x11;
    raw[4] = sequence & 0xff;
    raw[5] = (sequence >>> 8) & 0xff;
    raw[6] = (sequence >>> 16) & 0xff;
    raw[7] = (sequence >>> 24) & 0xff;
    const crc = historyProtocol.arcHistoryCrc16(raw, 30);
    raw[30] = crc & 0xff;
    raw[31] = crc >>> 8;
    return raw;
  };
  const packed = new Uint8Array(4 + 3 * 32);
  packed.set([0x67, 1, 3, 0]);
  [1001, 1002, 1003].forEach((sequence, index) => {
    packed.set(makeRecord(sequence), 4 + index * 32);
  });
  assert.deepEqual(historyProtocol.decodeArcHistoryStream(packed).map(record => record.sequence), [1001, 1002, 1003]);
  assert.throws(() => historyProtocol.decodeArcHistoryStream(packed.subarray(0, packed.length - 1)), /count\/length/);
  const corrupt = packed.slice();
  corrupt[4 + 32 + 30] ^= 1;
  assert.throws(() => historyProtocol.decodeArcHistoryStream(corrupt), /CRC mismatch/);
});

test('bounded phone batch requests allow 32 records while preserving frozen-head validation', () => {
  const frame = historyProtocol.encodeArcHistoryGetBatch(100, 132, 32);
  assert.equal(frame[10], 32);
  assert.throws(() => historyProtocol.encodeArcHistoryGetBatch(100, 132, 33), /limit/);
});

test('Cloud-skipped records do not advance local durability; Pure Local recovers the holes', async () => {
  const values=new Map(); const load=Module._load;
  Module._load=function(request,...args){if(request==='@react-native-async-storage/async-storage')return {getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)};return load.call(this,request,...args);};
  let cursors;try{cursors=require('../src/mesh/arcHistoryCursor.ts');}finally{Module._load=load;}
  await cursors.saveArcHistoryCursor('lamp-A',401,'son',100);
  await cursors.saveArcHistoryCursor('lamp-A',402,'son',100);
  let local=await cursors.loadArcHistoryDurability('lamp-A','son');
  assert.equal(local.cursor,-1); assert.deepEqual(local.ranges,[{from:401,through:402}]);
  assert.deepEqual(planHistoryRecovery(status(100,402),local.cursor,local.ranges).missingRanges,[{from:100,through:400}]);
  for(let seq=100;seq<=400;seq++)await cursors.saveArcHistoryCursor('lamp-A',seq,'son',100);
  local=await cursors.loadArcHistoryDurability('lamp-A','son');
  assert.equal(local.cursor,402); assert.deepEqual(local.ranges,[]);
  assert.equal((await cursors.loadArcHistoryDurability('lamp-A','father')).cursor,-1);
});
test('Cloud hydration, identity-witness matching and durability boundary remain in the native flow', () => {
  const app=fs.readFileSync(require.resolve('../App.tsx'),'utf8');
  assert.ok(app.includes('historyProbeRecordMatchesHint(record, witness)'));
  assert.ok(app.includes('head: witness.recoveryHead'));
  assert.ok(app.includes('head: historyStatus.newestSequence'));
  assert.ok(app.includes('loadArcHistoryDurability(lampId, userId)'));
  const start=app.indexOf('const historyQueues =');const end=app.indexOf('const unsubscribeProvisionState =',start);const flow=app.slice(start,end);
  assert.ok(flow.indexOf('await appendProbeLogRecord')<flow.indexOf('await saveArcHistoryCursor'));
  assert.ok(!flow.includes('acknowledgeHistoryThrough('));
});

test('stale sparse local state cannot mask a reset window; Cloud identity is checked inside the planner', () => {
  const stale=planHistoryRecovery(status(),200,[{from:100,through:600}],coverage([{from:100,through:400}]));
  assert.equal(stale.localStateAhead,true); assert.equal(stale.cloudTrusted,false); assert.equal(stale.after,99);
  for(const wrong of [{lampId:'lamp-B'},{streamId:'lamp:lamp-B:history'}]) {
    const plan=planHistoryRecovery(status(),0,[],{...coverage([{from:100,through:400}]),...wrong});
    assert.equal(plan.cloudTrusted,false); assert.equal(plan.after,99);
  }
  const cloudAhead=planHistoryRecovery(status(),0,[],coverage([{from:100,through:400}],100,500,501));
  assert.equal(cloudAhead.cloudAhead,true); assert.equal(cloudAhead.localStateAhead,false);
  const fresh=planHistoryRecovery(status(100,502),0,[],coverage([{from:100,through:501}],100,502,501));
  assert.equal(fresh.cloudTrusted,true); assert.equal(fresh.after,501); assert.equal(fresh.retryFreshStatus,false);
});

 test('legacy Phone A coverage 100–350 makes new Phone B recover only 351–450', () => {
  const plan=planHistoryRecovery(status(100,450),0,[],coverage([{from:100,through:350}],100,450,350));
  assert.deepEqual(plan.missingRanges,[{from:351,through:450}]);
  assert.equal(plan.after,350); assert.equal(plan.head,450);
 });

test('witness 4845 callbacks cannot close recovery expecting 4844; both records append before cursor advances', async () => {
  // Execute the actual App callback and queue/request functions with local I/O
  // mocked. This covers callbacks queued before binding and arriving afterwards.
  const app = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');
  const setup = app.slice(app.indexOf('    const historyQueues ='), app.indexOf('    const beginLampHistorySync ='));
  const recordStart = app.indexOf('      onRecord: (lampId, record, context) => {');
  const callback = app.slice(recordStart, app.indexOf('      onError:', recordStart)).trim().replace(/,$/, '');
  const logs = [], requests = [], appended = [], saved = [];
  let releaseAppend;
  const appendBarrier = new Promise(resolve => { releaseAppend = resolve; });
  const env = {
    HistoryRequestPhase: recovery.HistoryRequestPhase,
    historyOwner: new (require('../src/debug/historyTransportOwner.ts').HistoryTransportOwner)(),
    debugMailbox: { onRecord: () => { throw new Error('Unexpected debug routing in production fixture'); } },
    acceptHistorySequence: recovery.acceptHistorySequence,
    setTimeout, clearTimeout,
    mesh: {
      requestHistoryAfter: async (_id, after) => { requests.push(after); },
      requestHistoryBatch: async (_id, after) => { requests.push(after); },
    },
    addMeshLog: message => logs.push(message),
    currentCloudUserRef: { current: 'son' },
    historySyncPolicyRef: { current: { enabled: true } },
    historyInventoryRef: { current: { userId: 'son', devices: [] } },
    historyDevice: (_devices, id) => ({ id, access: { canViewHistory: true } }),
    meshNodesRef: { current: [] },
    probeLoggingSettingsRef: { current: {} },
    probeLoggingViewsOpenRef: { current: false },
    arcHistoryRecordToProbeStatus: () => ({}),
    appendProbeLogRecord: async r => { appended.push(Number(r.recordId.split(':').at(-1))); },
    appendRecoveredLampOperationalRecord: async (_id, r) => { await appendBarrier; appended.push(r.sequence); },
    saveArcHistoryCursor: async (_id, seq) => { assert.ok(appended.includes(seq)); saved.push(seq); },
  };
  const source = `${setup}\nconst handlers = {${callback}};\nreturn {handlers, historyQueues, historyIdentityWitnesses, historyProbeBindings, historyDrains, requestHistoryChunk, stopHistoryDrain};`;
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const flow = new Function(...Object.keys(env), compiled)(...Object.values(env));
  const lamp = 'lamp-A';
  const flush = () => flow.historyQueues.get(lamp);
  const frame = seq => ({ sequence: seq, recordType: 'lamp_operational' });
  const witness = { sequence: 4845, recordType: 'probe_environment', probeIndex: 1, timestampValid: true,
    unixTimeSeconds: 1800000000, ambientTemperatureC: 22, ambientHumidityPct: 40 };
  flow.historyIdentityWitnesses.set(lamp, { probeId: 'probe-A', snapshot: { sht45TemperatureC: 22, sht45HumidityPct: 40 },
    seenAt: 1800000000000, requestedAfter: 4837, scanned: 0, head: 4845,
    drainAfter: 4843, recoveryHead: 4845, framOldest: 4378, cloudEnabled: true, userId: 'son', mappingCount: 2 });
  try {
    await flow.requestHistoryChunk(lamp, 4837);
    for (let seq = 4838; seq <= 4844; seq++) { flow.handlers.onRecord(lamp, frame(seq)); await flush(); }
    flow.handlers.onRecord(lamp, witness);
    flow.handlers.onRecord(lamp, { ...witness }); // queued in the witness generation
    await flush();
    assert.ok(flow.historyDrains.has(lamp), logs.join('\n'));
    assert.equal(flow.historyProbeBindings.get(lamp).get(1), 'probe-A');
    assert.equal(flow.historyDrains.get(lamp).requestedAfter, 4843);
    flow.handlers.onRecord(lamp, { ...witness }); // late arrival after recovery began
    await flush();
    assert.equal(flow.historyDrains.get(lamp).requestedAfter, 4843);
    assert.deepEqual(saved, []);
    flow.handlers.onRecord(lamp, frame(4844));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(saved, []); // append is still blocked
    releaseAppend();
    await flush();
    flow.handlers.onRecord(lamp, { ...witness }); // response to recovery GET_AFTER 4844
    await flush();
    assert.deepEqual(appended, [4844, 4845]);
    assert.deepEqual(saved, [4844, 4845]);
    assert.ok(requests.includes(4843));
    assert.ok(requests.includes(4844));
    assert.equal(logs.filter(line => line.includes('reason=old_phase')).length, 2);
    assert.ok(!logs.some(line => line.includes('[DEFER]')));
    assert.equal(flow.historyDrains.has(lamp), false);
  } finally { releaseAppend(); flow.stopHistoryDrain(lamp); }
});

test('phase isolation keeps gap detection for unrecognized or changed records', () => {
  const phase = new recovery.HistoryRequestPhase();
  const witness = { sequence: 4845, value: 22 };
  phase.begin('witness', 4844);
  const old = phase.capture(witness);
  phase.rememberWitness(witness);
  phase.stop(true);
  phase.begin('recovery', 4843);
  assert.equal(phase.owns(old), false);
  assert.equal(phase.owns(phase.capture({ ...witness })), false);
  for (const record of [{ sequence: 4845, value: 23 }, { sequence: 4846 }]) {
    assert.equal(phase.owns(phase.capture(record)), true);
    assert.equal(recovery.acceptHistorySequence(4843, 4846, record.sequence), 'gap');
  }
});


test('fresh seq=0 singleton is recovered and beginning cursor is explicit on wire', () => {
  const plan=planHistoryRecovery(status(0,0),-1,[]);
  assert.deepEqual(plan.missingRanges,[{from:0,through:0}]);assert.equal(plan.after,-1);assert.equal(plan.head,0);
  const frame=historyProtocol.encodeArcHistoryGetBatch(-1,0,32);
  assert.deepEqual([...frame.slice(2,6)],[255,255,255,255]);assert.deepEqual([...frame.slice(6,10)],[0,0,0,0]);
  assert.equal(recovery.acceptHistorySequence(-1,0,0),'accept');
  assert.deepEqual(planHistoryRecovery(status(0,0),0,[]).missingRanges,[]);
  const cloud=planHistoryRecovery(status(0,2),-1,[],coverage([{from:0,through:0}],0,2,0));
  assert.equal(cloud.cloudTrusted,true);assert.deepEqual(cloud.missingRanges,[{from:1,through:2}]);
});
test('durable seq=0 differs from an absent cursor and replay remains idempotent', async () => {
  const values=new Map(),load=Module._load;
  Module._load=function(request,...args){if(request==='@react-native-async-storage/async-storage')return {getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value)};return load.call(this,request,...args);};
  const path=require.resolve('../src/mesh/arcHistoryCursor.ts');delete require.cache[path];let cursors;
  try{cursors=require(path);}finally{Module._load=load;}
  assert.equal((await cursors.loadArcHistoryDurability('zero','user')).cursor,-1);
  await cursors.saveArcHistoryCursor('zero',0,'user',0);
  assert.equal((await cursors.loadArcHistoryDurability('zero','user')).cursor,0);
  await cursors.saveArcHistoryCursor('zero',0,'user',0);
  assert.equal((await cursors.loadArcHistoryDurability('zero','user')).cursor,0);
});
