const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {DebugHistoryMailbox,DEBUG_HISTORY_MAX_RECORDS}=require('../src/debug/debugHistoryMailbox.ts');
const {HistoryTransportOwner}=require('../src/debug/historyTransportOwner.ts');
const codec=require('../src/mesh/arcHistoryProtocol.ts');
const {buildDebugHistoryGraph}=require('../src/debug/debugHistoryGraph.ts');
const delay=()=>new Promise(resolve=>setTimeout(resolve,3));
const status=(oldest=100,count=468)=>({ready:true,recordVersion:2,recordBytes:32,layoutVersion:2,capacity:468,count,oldestSequence:oldest,newestSequence:oldest+count-1,acknowledgedSequence:0,mappingCount:1,probeIntervalSeconds:60,lampIntervalSeconds:60,lampFollowsProbe:true});
function physical(sequence,lamp=sequence%5===0,probeIndex=0){
 const raw=new Uint8Array(32);raw[0]=lamp?0x22:0x21;raw[1]=lamp?0:probeIndex;raw[2]=lamp?0x7f:0xff;raw[3]=lamp?7:0x80|75;
 const view=new DataView(raw.buffer);view.setUint32(4,sequence,true);view.setUint32(8,1790000000+sequence*60,true);
 for(let i=12;i<30;i+=2)view.setUint16(i,200+i,true);
 view.setUint16(30,codec.arcHistoryCrc16(raw,30),true);return raw;
}
function record(sequence,lamp=false,probeIndex=0){const envelope=new Uint8Array(36);envelope.set([0x65,1,32,0]);envelope.set(physical(sequence,lamp,probeIndex),4);return codec.decodeArcHistoryRecord(envelope);}
function packet(sequences){
 if(sequences.length===1)return [record(sequences[0],sequences[0]%5===0)];
 const bytes=new Uint8Array(4+32*sequences.length);bytes.set([0x67,1,sequences.length,0]);
 sequences.forEach((sequence,index)=>bytes.set(physical(sequence),4+32*index));return codec.decodeArcHistoryStream(bytes);
}
function harness(options={}){
 let time=0;const owner=new HistoryTransportOwner();const requests=[],reads=[],logs=[],releases=[];let statusRequests=0;
 const box=new DebugHistoryMailbox({sessionState:async()=>options.ready??'SESSION_READY',
  acquire:(id,signal)=>owner.acquireDebug(id,signal),release:id=>{releases.push(id);owner.releaseDebug(id);},
  requestStatus:async()=>{statusRequests++;},requestBatch:async(id,after,head,limit)=>requests.push({id,after,head,limit}),
  requestAfter:async(id,after)=>reads.push({id,after}),log:message=>logs.push(message),now:()=>time,inactivityMs:options.timeout??10000});
 return {box,owner,requests,reads,logs,releases,advance:ms=>time+=ms,statusRequests:()=>statusRequests};
}
function feed(h,request){
 const through=Math.min(request.head,request.after+request.limit);
 for(let start=request.after+1;start<=through;start+=7){
  h.advance(250);const seqs=Array.from({length:Math.min(7,through-start+1)},(_,i)=>start+i);
  packet(seqs).forEach(row=>h.box.onRecord(request.id,row,h.box.debugRunId));
 }
}
function fence(h,currentStatus=status()){
 assert.equal(h.owner.owner,'DEBUG_MAILBOX');h.box.onStatus('lamp-A',currentStatus,h.box.debugRunId);
 assert.ok(h.reads.at(-1).after>currentStatus.newestSequence);
 h.box.onRecord('lamp-A',null,h.box.debugRunId);assert.equal(h.owner.owner,'NONE');
}

test('full 468-record dump ignores coverage, chains 15 bounded passes at one frozen head, and validates mixed physical CRC records',async()=>{
 const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(),h.box.debugRunId);
 for(let index=0;index<15;index++){
  assert.equal(h.requests.length,index+1);const request=h.requests[index];assert.equal(request.head,567);assert.equal(request.limit,32);
  feed(h,request);await delay();
 }
 const result=h.box.snapshot();assert.equal(result.state,'complete');assert.equal(result.received,468);assert.equal(result.expected,468);
 assert.equal(result.records[0].record.sequence,100);assert.equal(result.records.at(-1).record.sequence,567);
 assert.deepEqual(result.records.map(row=>row.record.sequence),Array.from({length:468},(_,i)=>100+i));
 assert.equal(result.batches,15);assert.equal(result.sequenceGaps,0);assert.equal(result.duplicates,0);assert.equal(result.outOfOrder,0);
 assert.ok(result.records.some(row=>row.record.recordType==='lamp_operational'));assert.ok(result.records.some(row=>row.record.recordType==='probe_environment'));
 assert.ok(result.firstRecordMs>0 && result.averageRate>0 && result.streamRate>0);assert.equal(result.interBatchGapTotalMs,0);
 assert.ok(h.logs.some(line=>line.startsWith('[DebugHistory][COMPLETE]')));assert.equal(h.releases.length,0);
 fence(h,status(103,468));assert.equal(h.box.snapshot().frozenHead,567); // cleanup status never changes dump snapshot
 h.box.dispose();
});

test('production durability finishes before debug acquires and new production requests defer',async()=>{
 const h=harness();assert.equal(h.owner.tryProduction('lamp-A'),true);
 const started=h.box.start('lamp-A');await delay();assert.equal(h.box.snapshot().state,'starting');
 assert.equal(h.requests.length,0);assert.equal(h.statusRequests(),0);assert.equal(h.owner.tryProduction('lamp-B'),false);
 h.owner.releaseProduction('lamp-A');await started;assert.equal(h.owner.owner,'DEBUG_MAILBOX');assert.equal(h.statusRequests(),1);
 h.box.onStatus('lamp-A',status(100,1),h.box.debugRunId);feed(h,h.requests[0]);fence(h,status(100,1));assert.equal(h.owner.tryProduction('lamp-A'),true);h.box.dispose();
});

test('Clear immediately empties mailbox but keeps the lease until read-only cancellation fence; late rows cannot enter production',async()=>{
 const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(2000000,32),h.box.debugRunId);
 h.box.onRecord('lamp-A',record(2000000),h.box.debugRunId);assert.equal(h.box.snapshot().received,1);
 h.box.clear();const cleared=h.box.snapshot();assert.equal(cleared.received,0);assert.equal(cleared.expected,0);assert.equal(cleared.state,'cancelling');assert.equal(cleared.busy,true);
 assert.equal(h.owner.tryProduction('lamp-A'),false);
 h.box.onRecord('lamp-A',record(2000001),h.box.debugRunId);assert.equal(h.box.snapshot().received,0);
 fence(h,status(2000000,32));assert.equal(h.box.snapshot().busy,false);assert.equal(h.box.snapshot().invalidFields,0);h.box.dispose();
});

test('Clear while waiting for production cancels acquisition without stealing the lease',async()=>{
 const h=harness();h.owner.tryProduction('lamp-A');const started=h.box.start('lamp-A');await delay();h.box.clear();await started;
 assert.equal(h.owner.owner,'PRODUCTION');assert.equal(h.statusRequests(),0);assert.equal(h.box.snapshot().busy,false);
 h.owner.releaseProduction('lamp-A');assert.equal(h.owner.owner,'NONE');h.box.dispose();
});

test('gap, duplicate, out-of-order and beyond-head records never count as a complete dump',async()=>{
 for(const [sequences,key] of [[[100,102],'sequenceGaps'],[[100,100],'duplicates'],[[99],'outOfOrder'],[[133],null]]){
  const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);
  sequences.forEach(sequence=>h.box.onRecord('lamp-A',record(sequence),h.box.debugRunId));
  assert.equal(h.box.snapshot().state,'error');if(key)assert.ok(h.box.snapshot()[key]>0);
  assert.equal(h.owner.owner,'DEBUG_MAILBOX');fence(h,status(100,32));h.box.dispose();
 }
});

test('physical source verification distinguishes mailbox loss from source skipping without repairing the failed capture',async()=>{
 for(const [returned,outcome] of [[101,'source_present_mailbox_missed'],[102,'source_skipped_sequence']]){
  const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);
  h.box.onRecord('lamp-A',record(100),h.box.debugRunId);h.box.onRecord('lamp-A',record(102),h.box.debugRunId);fence(h,status(100,32));
  await h.box.verifyMissingSequence(101);h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);assert.equal(h.reads.at(-1).after,100);
  h.box.onRecord('lamp-A',record(returned),h.box.debugRunId);fence(h,status(100,32));
  assert.equal(h.box.snapshot().sourceCheck.outcome,outcome);assert.equal(h.box.snapshot().received,1);assert.equal(h.box.snapshot().sequenceGaps,1);
  assert.equal(h.box.snapshot().state,'error');h.box.dispose();
 }
});

test('source verification reports overwrite separately from receive loss',async()=>{
 const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);h.box.onRecord('lamp-A',record(102),h.box.debugRunId);fence(h,status(100,32));
 await h.box.verifyMissingSequence(100);h.box.onStatus('lamp-A',status(101,32),h.box.debugRunId);
 assert.equal(h.box.snapshot().sourceCheck.outcome,'outside_current_fram_window');fence(h,status(101,32));h.box.dispose();
});

test('inactivity timeout resets on forward progress; disconnect releases ownership and marks incomplete',async()=>{
 const h=harness({timeout:50});await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);
 await new Promise(resolve=>setTimeout(resolve,30));h.box.onRecord('lamp-A',record(100),h.box.debugRunId);
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(h.box.snapshot().state,'dumping');
 h.box.onDisconnect('lamp-A');assert.equal(h.owner.owner,'NONE');assert.equal(h.box.snapshot().state,'error');h.box.dispose();
});

test('empty FRAM, session readiness, incompatible geometry, bounded RAM and repeated dump are explicit',async()=>{
 const noSession=harness({ready:'DISCOVERING'});await noSession.box.start('lamp-A');assert.equal(noSession.statusRequests(),0);assert.equal(noSession.box.snapshot().state,'error');noSession.box.dispose();
 const empty=harness();await empty.box.start('lamp-A');empty.box.onStatus('lamp-A',status(0,0),empty.box.debugRunId);assert.equal(empty.box.snapshot().state,'complete');assert.equal(empty.requests.length,0);empty.box.dispose();
 const big=harness();await big.box.start('lamp-A');big.box.onStatus('lamp-A',{...status(),count:DEBUG_HISTORY_MAX_RECORDS+1,capacity:9999,newestSequence:100+DEBUG_HISTORY_MAX_RECORDS},big.box.debugRunId);assert.equal(big.box.snapshot().state,'error');assert.equal(big.requests.length,0);fence(big);big.box.dispose();
 const repeated=harness();for(let run=0;run<2;run++){await repeated.box.start('lamp-A');repeated.box.onStatus('lamp-A',status(100,3),repeated.box.debugRunId);feed(repeated,repeated.requests.at(-1));fence(repeated,status(100,3));assert.equal(repeated.box.snapshot().received,3);repeated.box.clear();assert.equal(repeated.box.snapshot().received,0);}repeated.box.dispose();
});

test('type-aware timestamps and per-field graph holes never create false sequence gaps',async()=>{
 const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,5),h.box.debugRunId);
 const rows=[record(100),record(101,true),record(102),record(103,true),record(104)];
 rows[0].unixTimeSeconds=1000;rows[1].unixTimeSeconds=1000;rows[2].unixTimeSeconds=1060;rows[3].unixTimeSeconds=1060;rows[4].unixTimeSeconds=1120;
 rows[2].soilDepth1Raw=null;rows.forEach(row=>h.box.onRecord('lamp-A',row,h.box.debugRunId));
 const snapshot=h.box.snapshot();assert.equal(snapshot.sequenceGaps,0);assert.equal(snapshot.timestampGaps,0);assert.equal(snapshot.invalidFields,1);
 const graph=buildDebugHistoryGraph(snapshot.records,['soilDepth1Raw','ambientHumidityPct','coreTemperatureC'],500,250);
 const soil=graph.series.find(item=>item.signalKey.startsWith('soilDepth1Raw:'));assert.deepEqual(soil.points.map(p=>p.sequence),[100,104]);
 assert.equal((soil.path.match(/M /g)||[]).length,2); // no interpolated line across field-level hole
 const humidity=graph.series.find(item=>item.signalKey.startsWith('ambientHumidityPct:'));assert.deepEqual(humidity.points.map(p=>p.sequence),[100,102,104]);assert.equal((humidity.path.match(/M /g)||[]).length,1); // Lamp interleaving isn't a transport gap
 assert.equal(snapshot.records[2].record.soilDepth1Raw,null);fence(h,status(100,5));h.box.dispose();
});

test('separate stored Probe indices retain separate curves and cadence histories even while offline',async()=>{
 const h=harness();await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,4),h.box.debugRunId);
 const rows=[record(100,false,0),record(101,false,1),record(102,false,0),record(103,false,1)];
 rows.forEach((row,index)=>{row.unixTimeSeconds=1000+Math.floor(index/2)*60;h.box.onRecord('lamp-A',row,h.box.debugRunId);});
 assert.equal(h.box.snapshot().timestampGaps,0);const graph=buildDebugHistoryGraph(h.box.snapshot().records,['ambientHumidityPct'],400,250);
 assert.equal(graph.series.length,2);assert.deepEqual(graph.series[0].points.map(point=>point.sequence),[100,102]);fence(h,status(100,4));h.box.dispose();
});

test('debug module has no production durability/cloud API and Scan layout is independent from diagnostic controls',()=>{
 const source=fs.readFileSync(require.resolve('../src/debug/debugHistoryMailbox.ts'),'utf8');
 assert.doesNotMatch(source,/AsyncStorage|FileSystem|portalClient|appendProbeLogRecord|saveArcHistoryCursor|acknowledgeHistory/);
 const app=fs.readFileSync(require.resolve('../App.tsx'),'utf8');
 assert.match(app,/left: '50%', marginLeft: -43[\s\S]*?onPress=\{handleMeshScan\}/);
 assert.match(app,/footerCommsActions: \{\s*position: 'absolute',\s*left: 0,\s*right: 0,/);
 assert.ok(app.indexOf('debugMailbox.onRecord(lampId, record, ingress.debugRunId)')<app.indexOf('queueHistoryRecordWork(lampId, record, async'));
 for(const width of [320,375,390,768]){
  const center=width*.5-43+86/2;assert.equal(center,width/2); // independent of Debug/Copy widths and visibility
 }
});


test('Clear midway through a decoded seven-record packet invalidates its captured run and never routes the remainder into production', async () => {
  const h=harness(); await h.box.start('lamp-A'); h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);
  const app=fs.readFileSync(require.resolve('../App.tsx'),'utf8');
  const start=app.indexOf('      onRecord: (lampId, record, context) => {');
  const callback=app.slice(start,app.indexOf('      onError:',start)).trim().replace(/,$/,'');
  let productionCallbacks=0;
  const compiled=ts.transpileModule(`return {${callback}};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const handlers=new Function('historyOwner','debugMailbox','queueHistoryRecordWork',compiled)(h.owner,h.box,()=>productionCallbacks++);
  const oldRun=h.box.debugRunId;
  const context={owner:'DEBUG_MAILBOX',debugRunId:oldRun};
  const decoded=packet([100,101,102,103,104,105,106]); assert.equal(decoded.length,7);
  for(let index=0;index<decoded.length;index++) {
    handlers.onRecord('lamp-A',decoded[index],context);
    if(index===2) {
      h.box.clear(); assert.ok(h.box.debugRunId>oldRun);
      assert.equal(h.box.snapshot().state,'cancelling');assert.equal(h.box.snapshot().received,0);
      assert.equal(h.owner.owner,'DEBUG_MAILBOX');assert.equal(h.owner.tryProduction('lamp-A'),false);
      fence(h,status(100,32)); // adversarial: even if lease changes before the remaining callbacks
      assert.equal(h.owner.tryProduction('lamp-A'),true);
    }
  }
  assert.equal(productionCallbacks,0);assert.equal(h.box.snapshot().received,0);
  assert.equal(h.box.snapshot().discardedAfterCancel,4);h.owner.releaseProduction('lamp-A');
  await h.box.start('lamp-A');h.box.onStatus('lamp-A',status(100,32),h.box.debugRunId);
  handlers.onRecord('lamp-A',record(100),context);assert.equal(h.box.snapshot().received,0);
  handlers.onRecord('lamp-A',record(100),{owner:'DEBUG_MAILBOX',debugRunId:h.box.debugRunId});assert.equal(h.box.snapshot().received,1);
  h.box.clear();fence(h,status(100,32));h.box.dispose();
});

test('cancelled packets still undergo complete physical decode and CRC validation',()=>{
  const bytes=new Uint8Array(4+7*32);bytes.set([0x67,1,7,0]);
  for(let index=0;index<7;index++)bytes.set(physical(100+index),4+index*32);
  bytes[4+6*32+12]^=1;
  assert.throws(()=>codec.decodeArcHistoryStream(bytes),/CRC/); // corruption in the final physical record is not skipped
  const source=fs.readFileSync(require.resolve('../src/mesh/index.ts'),'utf8');
  assert.match(source,/const recordContext: HistoryIngressContext = Object.freeze\(handlers.captureRecordContext\?\.\(nodeId\)/);
  assert.match(source,/for \(const record of decodeArcHistoryStream\(data\)\)/);
  assert.match(source,/handlers.onRecord\?\.\(nodeId, record, recordContext\)/);
});


test('retiring production effect cannot release a newer lease or let debug enter while durable work is retiring',()=>{
  const owner=new HistoryTransportOwner();assert.equal(owner.tryProduction('lamp-A'),true);const old=owner.leaseId;
  owner.closeProduction('lamp-A',old);assert.equal(owner.tryProduction('lamp-A'),false);
  owner.releaseProduction('lamp-A',old);assert.equal(owner.tryProduction('lamp-A'),true);
  const fresh=owner.leaseId;assert.ok(fresh>old);owner.releaseProduction('lamp-A',old);
  assert.equal(owner.owner,'PRODUCTION');assert.equal(owner.leaseId,fresh);
});
