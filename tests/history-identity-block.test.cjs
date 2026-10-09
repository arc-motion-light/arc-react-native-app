const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { registeredProbeForHistoryIndex, canRetryBlockedProbeHistory } = require('../src/mesh/arcHistoryIdentity.ts');
const access = { isOwner:true, canViewHistory:true };
const device = (type, id, sources=[]) => ({ type, id, access, telemetrySourceNodeIds:sources });
const lampMac = '00:80:E1:2A:E4:32';
const lampId = 'CE092F02-A688-A941-353F-4636EF8AD8AA';
const probeId = '819907EE-CB8E-78EB-3F8B-DBDE486DBC93';

test('G4 probe_index resolves from explicit registered source under either the BLE or canonical Lamp identifier', () => {
  const lamp = device('lamp',lampId,[lampMac]);
  for (const source of [`lamp-history:${lampMac}:probe-1`, `lamp-history:${lampId}:probe-1`]) {
    const probe = device('probe', probeId, [source]);
    assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampMac,1)?.id,probeId);
    assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampId,1)?.id,probeId);
    assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampMac,2),null);
  }
});
test('G4 index cannot be inferred from same device name, one claimed Probe, or different recorded source', () => {
  const lamp = device('lamp',lampId,[lampMac]);
  const probe = device('probe',probeId,[]);
  assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampMac,1),null);
  assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampMac,-1),null);
  assert.equal(registeredProbeForHistoryIndex([lamp,probe], lampMac,256),null);
  const duplicate = device('probe','another-probe',[`lamp-history:${lampId}:probe-1`]);
  const mapped = {...probe, telemetrySourceNodeIds:[`lamp-history:${lampId}:probe-1`]};
  assert.equal(registeredProbeForHistoryIndex([lamp,mapped,duplicate],lampMac,1),null);
});
test('blocked Probe history does not poll repeatedly while no verified mapping exists', () => {
  const block = { accountUid:'owner', probeIndex:1, lastHintSeenAt:100_000, probeIntervalMs:300_000 };
  const basic = { accountUid:'owner', now:450_000, registeredProbeId:null,registeredHasHistoryGrant:false,
    witnessedProbeId:null,witnessHasHistoryGrant:false,hintSeenAt:null,hintHasHistoryGrant:false };
  assert.equal(canRetryBlockedProbeHistory(block,basic),false);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,accountUid:'stranger'}),false);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,hintSeenAt:150_000,hintHasHistoryGrant:true,now:151_000}),false);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,hintSeenAt:400_000,hintHasHistoryGrant:false,now:401_000}),false);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,hintSeenAt:400_000,hintHasHistoryGrant:true,now:401_000}),true);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,registeredProbeId:probeId,registeredHasHistoryGrant:true}),true);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,registeredProbeId:probeId,registeredHasHistoryGrant:false}),false);
  assert.equal(canRetryBlockedProbeHistory(block,{...basic,witnessedProbeId:probeId,witnessHasHistoryGrant:true}),true);
  const conflicting = { ...block, conflictingRegisteredId:probeId, conflictingWitnessedId:'other-probe' };
  assert.equal(canRetryBlockedProbeHistory(conflicting,{...basic, registeredProbeId:probeId,
    registeredHasHistoryGrant:true, witnessedProbeId:'other-probe', witnessedHasHistoryGrant:true}),false);
});
test('history recovery streams bounded 32-record chunks directly and blocks unidentified indexes without cursor advancement', () => {
  const app = fs.readFileSync(require.resolve('../App.tsx'),'utf8');
  assert.match(app,/const HISTORY_BATCH_LIMIT = 32/);
  assert.match(app,/const HISTORY_PASS_RECORD_LIMIT = 256/);
  assert.match(app,/await requestHistoryBatchChunk\(\s*lampId,\s*record.sequence,\s*drain.head/);
  assert.match(app,/retry=immediate/);
  assert.match(app,/historyIdentityBlocks\.set\(lampId,[\s\S]{0,500}stopHistoryDrain\(lampId\)/);
  assert.ok(app.indexOf('historyIdentityBlocks.set(lampId, {') < app.indexOf('await saveArcHistoryCursor(lampId, record.sequence'));
  assert.ok(!app.includes('downloaded >= HISTORY_BATCH_LIMIT || Date.now()'));
});

function simulatedHistoryFlow() {
  const app = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');
  const setup = app.slice(app.indexOf('    const historyQueues ='), app.indexOf('    const beginLampHistorySync ='));
  const cb = app.slice(app.indexOf('      onRecord: (lampId, record, context) => {'),
    app.indexOf('      onError:', app.indexOf('      onRecord: (lampId, record, context) => {'))).trim().replace(/,$/, '');
  const calls=[], saved=[], logs=[];
  const env={
    HistoryRequestPhase:require('../src/mesh/arcHistorySession.ts').HistoryRequestPhase,
    historyOwner:new (require('../src/debug/historyTransportOwner.ts').HistoryTransportOwner)(),
    debugMailbox:{ onRecord:()=>{ throw Error('debug packet in production') } },
    acceptHistorySequence:require('../src/mesh/arcHistorySession.ts').acceptHistorySequence,
    registeredProbeForHistoryIndex,
    routedHistoryHints:new Map(),
    setTimeout,clearTimeout,
    mesh:{requestHistoryAfter:async()=>{},requestHistoryBatch:async(id,after,head,limit)=>{calls.push({id,after,head,limit})}},
    addMeshLog:message=>logs.push(message),
    currentCloudUserRef:{current:'owner'}, historySyncPolicyRef:{current:{enabled:true}},
    historyInventoryRef:{current:{userId:'owner',devices:[]}},
    historyDevice:(_devices,id)=> id==='lamp-A'?{id,access:{canViewHistory:true}}:null,
    meshNodesRef:{current:[]}, probeLoggingSettingsRef:{current:{}},
    probeLoggingViewsOpenRef:{current:false},
    arcHistoryRecordToProbeStatus:()=>({}),
    appendProbeLogRecord:async()=>{},
    appendRecoveredLampOperationalRecord:async()=>{},
    saveArcHistoryCursor:async(_id,seq)=>saved.push(seq),
  };
  const source=`${setup}\nconst handlers={${cb}};return {handlers,historyDrains,historyQueues,historyIdentityBlocks,requestHistoryBatchChunk,stopHistoryDrain};`;
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const flow=new Function(...Object.keys(env),compiled)(...Object.values(env));
  const flush=()=>flow.historyQueues.get('lamp-A');
  return {flow,calls,saved,logs,flush};
}

test('32 successful physical records immediately request the next chunk without waiting for next poll',async()=>{
  const {flow,calls,saved,flush}=simulatedHistoryFlow();
  flow.historyDrains.set('lamp-A',{startedAt:Date.now(),requestedAfter:0,downloaded:0,
    head:64,batchThrough:0,userId:'owner',mappingCount:0,probeIntervalSeconds:300,
    framOldest:1,cloudEnabled:true});
  try{
    await flow.requestHistoryBatchChunk('lamp-A',0,64);
    for(let sequence=1;sequence<=32;sequence++){
      flow.handlers.onRecord('lamp-A',{sequence,recordType:'lamp_operational'});
      await flush();
    }
    assert.deepEqual(calls.map(c=>c.after),[0,32]);
    assert.deepEqual(calls.map(c=>c.limit),[32,32]);
    assert.equal(saved.length,32);
    assert.equal(flow.historyDrains.get('lamp-A').requestedAfter,32);
  }finally{flow.stopHistoryDrain('lamp-A')}
});

test('unidentified Probe at first record blocks rather than advancing cursor or requesting it again',async()=>{
  const {flow,calls,saved,logs,flush}=simulatedHistoryFlow();
  flow.historyDrains.set('lamp-A',{startedAt:Date.now(),requestedAfter:1190,downloaded:0,
    head:1199,batchThrough:1199,userId:'owner',mappingCount:3,probeIntervalSeconds:300,
    framOldest:1190,cloudEnabled:true});
  try{
    await flow.requestHistoryBatchChunk('lamp-A',1190,1199);
    flow.handlers.onRecord('lamp-A',{sequence:1191,recordType:'probe_environment',probeIndex:1,
      timestampValid:true,unixTimeSeconds:1791486398});
    flow.handlers.onRecord('lamp-A',{sequence:1192,recordType:'lamp_operational'});
    await flush();
    assert.equal(flow.historyIdentityBlocks.get('lamp-A')?.probeIndex,1, JSON.stringify(logs));
    assert.equal(flow.historyDrains.has('lamp-A'),false);
    assert.deepEqual(saved,[]);
    assert.deepEqual(calls.map(c=>c.after),[1190]);
    assert.ok(logs.some(log=>log.includes('[HistorySync][BLOCKED]')));
    assert.ok(!logs.some(log=>log.includes('reason=old_phase')));
  }finally{flow.stopHistoryDrain('lamp-A')}
});
