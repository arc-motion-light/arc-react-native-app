const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,f);
const {buildHardwareHistoryUpload, isHardwareUploadRecord} = require('../src/cloud/hardwareHistoryV4.ts');
const {prepareHistoryUpload} = require('../src/cloud/historyGateway.ts');
const lampUid='3F0033001250364146313320', probeUid='0102030405060708090A0B0C';
const lampId='CE092F02-A688-A941-353F-4636EF8AD8AA', probeId='819907EE-CB8E-78EB-3F8B-DBDE486DBC93';
const generation='000000000000000A', nodeGeneration='000000000000000B';
const id=`lamp:${lampUid}:generation:${generation}:history:17`;
const provenance = (extra={}) => ({lampHardwareUid:lampUid, sourceHardwareUid:lampUid,
  journalGeneration:generation,nodeGeneration:generation,lampSequence:17,nodeSequence:5,
  measurementTimestampValid:true,measurementUnixTimeSeconds:1791640000,measurementMilliseconds:123,
  collectionTimestampValid:true,collectionUnixTimeSeconds:1791640001,collectionMilliseconds:789,
  ...extra});
const lampRecord = (extra={}) => ({recordId:id,recordType:'lamp_operational',lampId:'native-lamp',
  timeline:{lampSampledAtMs:1791640001789,receivedAtMs:1791640010000,timestampOrigin:'lamp_g4_rtc'},
  measured:{coreTemperatureC:42.1},commanded:{lampOn:true},derived:{inputPowerWatts:15},state:{outputsEnabled:true},
  hardwareProvenance:provenance(),...extra});
const device = (type,deviceId,aliases=[]) => ({id:deviceId,type,telemetrySourceNodeIds:aliases,
  access:{canViewHistory:true,canViewTelemetry:true,canControl:false,canEditSettings:false}});
const inventory=[device('lamp',lampId,['native-lamp']),device('probe',probeId,['native-probe'])];
const ownerBindings=[{hardwareUid:lampUid,arcDeviceId:lampId,confirmedBy:'owner'}];

test('v4 Lamp collection identity, independent millisecond clocks, canonical payload',()=>{
  const built=buildHardwareHistoryUpload(lampRecord());
  assert.ok(built);assert.equal(isHardwareUploadRecord(built),true);
  assert.equal(built.measurementTimestampMs,1791640000123);
  assert.equal(built.collectionTimestampMs,1791640001789);
  assert.equal(built.phoneReceivedAtMs,1791640010000);
  assert.equal(built.lampSequence,17);assert.equal(built.nodeSequence,5);
  assert.equal(prepareHistoryUpload(built,inventory,[], 'owner'),null);
  const result=prepareHistoryUpload(built,inventory,ownerBindings,'owner');
  assert.equal(result.canonicalLampId,lampId);
  assert.equal(result.lampId,lampId);assert.equal(result.payload.lampId,lampId);
  assert.equal(result.payload.recordId,id);
  assert.equal(result.recordId,id);
  assert.equal(result.sourceHardwareUid,lampUid);
});

test('invalid original timestamp remains null; no phone timestamp substitution',()=>{
  const input=lampRecord({hardwareProvenance:provenance({measurementTimestampValid:false,
    measurementUnixTimeSeconds:0,measurementMilliseconds:0})});
  const built=buildHardwareHistoryUpload(input);
  assert.equal(built.measurementTimestampMs,null);
  assert.equal(built.measurementTimeValid,false);
  assert.equal(built.collectionTimestampMs,1791640001789);
  assert.equal(prepareHistoryUpload(built,inventory,ownerBindings,'owner').measurementTimestampMs,null);
});

test('malformed, mismatched and inconsistent hardware origin histories fail closed',()=>{
  const invalid=[
    {journalGeneration:'0000000000000000'},
    {lampHardwareUid:'000000000000000000000000'},
    {sourceHardwareUid:probeUid},
    {nodeGeneration:nodeGeneration},
    {lampSequence:18},
    {measurementTimestampValid:false,measurementUnixTimeSeconds:1791640000},
    {measurementMilliseconds:1000},
    {collectionTimestampValid:false,collectionUnixTimeSeconds:1791640001},
  ];
  for(const broken of invalid){
    const record=lampRecord({hardwareProvenance:provenance(broken)});
    assert.equal(buildHardwareHistoryUpload(record),null,JSON.stringify(broken));
  }
  assert.equal(buildHardwareHistoryUpload(lampRecord({recordId:'lamp:native-lamp:history:17'})),null);
});

test('v4 account/grant/UID conflicts prevent accidental uploads',()=>{
  const built=buildHardwareHistoryUpload(lampRecord());
  assert.equal(prepareHistoryUpload(built,inventory,ownerBindings,null),null);
  assert.equal(prepareHistoryUpload(built,inventory,ownerBindings,'another-user'),null);
  assert.equal(prepareHistoryUpload(built,inventory.map(d=>({...d,access:{...d.access,canViewHistory:false}})),ownerBindings,'owner'),null);
  assert.equal(prepareHistoryUpload(built,inventory,[...ownerBindings,{hardwareUid:lampUid,arcDeviceId:'another',confirmedBy:'owner'}],'owner'),null);
  assert.equal(prepareHistoryUpload(built,[device('lamp','conflict',['native-lamp']),device('lamp',lampId),device('probe',probeId)],ownerBindings,'owner'),null);
});

test('Probe v4 keeps true source generation separate and requires an assigned Probe binding',()=>{
  const probe={recordId:id, probeId:'native-probe',
    timeline:{receivedAtMs:1791640010000,deviceTimestampMs:1791639999000,timestampValid:true},
    telemetry:{batteryPct:50},hardwareProvenance:provenance({sourceHardwareUid:probeUid,nodeGeneration, nodeSequence:12})};
  const built=buildHardwareHistoryUpload(probe);
  assert.equal(built.recordType,'probe_environment');
  assert.equal(built.nodeGeneration,nodeGeneration);
  assert.equal(built.lampId,lampUid);
  assert.equal(prepareHistoryUpload(built,inventory,ownerBindings,'owner'),null); // Probe untouched/unassigned
  const ready=prepareHistoryUpload(built,inventory,[...ownerBindings,{hardwareUid:probeUid,arcDeviceId:probeId,confirmedBy:'owner'}],'owner');
  assert.equal(ready.canonicalLampId,lampId);assert.equal(ready.canonicalProbeId,probeId);
  assert.equal(ready.payload.probeId,probeId);assert.equal(ready.lampId,lampId);
});

test('legacy sequence-only upload still resolves by registered transport identity',()=>{
  const legacy={recordId:'lamp:native-lamp:history:401',recordType:'lamp_operational',lampId:'native-lamp',
    historySequence:401,measurementTimestampMs:1791640000000,phoneReceivedAtMs:1791640010000,
    timestampOrigin:'lamp_g4_rtc',payload:{recordId:'lamp:native-lamp:history:401',lampId:'native-lamp'}};
  assert.equal(prepareHistoryUpload(legacy,inventory).canonicalLampId,lampId);
  assert.equal(isHardwareUploadRecord(legacy),false);
});

test('durable queue keeps v3/v4 uploads in separate batches and never marks an unacknowledged v4 synced',async()=>{
  const Module=require('node:module'); const original=Module._load;
  const files=new Map(); const v4=lampRecord();
  const v3={recordId:'lamp:native-lamp:history:50',lampId:'native-lamp',
    timeline:{lampSampledAtMs:1791640000000,receivedAtMs:1791640010000,timestampOrigin:'lamp_g4_rtc'}};
  Module._load=function(request,parent,...rest){
    if(request==='@react-native-async-storage/async-storage')return {getItem:async()=>null,setItem:async()=>{}};
    if(request==='expo-file-system/legacy')return {documentDirectory:'/durable/',EncodingType:{UTF8:'utf8'},
      getInfoAsync:async(path)=>({exists:files.has(path)}),makeDirectoryAsync:async()=>{},
      readAsStringAsync:async(path)=>files.get(path),writeAsStringAsync:async(path,text)=>files.set(path,text)};
    if(parent?.filename.endsWith('localTelemetryStore.ts') && request==='./lampLogger')return {loadAllLampOperationalRecords:async()=>[v4,v3]};
    if(parent?.filename.endsWith('localTelemetryStore.ts') && request==='./probeLogger')return {loadAllProbeLogRecords:async()=>[]};
    return original.call(this,request,parent,...rest);
  };
  let store;
  try{store=require('../src/localTelemetryStore.ts')}finally{Module._load=original}
  const batches=[];
  const result=await store.drainCloudTelemetry(async records=>{
    batches.push(records.map(x=>x.recordId));
    if(isHardwareUploadRecord(records[0]))return {acceptedRecordIds:[]};
    return {acceptedRecordIds:records.map(x=>x.recordId)};
  });
  assert.equal(batches.length,2);assert.deepEqual(batches.map(x=>x.length),[1,1]);
  assert.equal(result.uploaded,1);
  const state=JSON.parse(files.get('/durable/arc-local-telemetry/cloud-sync-state.json'));
  assert.equal(state[v3.recordId].state,'synced');
  assert.notEqual(state[v4.recordId].state,'synced');
  const retry=await store.drainCloudTelemetry(async records=>({
    acceptedRecordIds:records.map(r=>r.recordId)
  }));
  assert.equal(retry.uploaded,1);
  const finalState=JSON.parse(files.get('/durable/arc-local-telemetry/cloud-sync-state.json'));
  assert.equal(finalState[v4.recordId].state,'synced');
});

test('iOS release interlock keeps Cloud Sync disabled until explicitly approved',()=>{
  const app=fs.readFileSync(require.resolve('../App.tsx'),'utf8');
  assert.match(app,/const ARC_CLOUD_SYNC_VALIDATION_HOLD = true/);
  assert.match(app,/if \(ARC_CLOUD_SYNC_VALIDATION_HOLD \|\| !cloudSyncPreferenceReady \|\| !cloudSyncEnabled\)/);
  assert.equal((app.match(/disabled=\{ARC_CLOUD_SYNC_VALIDATION_HOLD\}/g)||[]).length,2);
});
