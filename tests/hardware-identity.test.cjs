const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const identity=require('../src/mesh/hardwareIdentity.ts');
const history=require('../src/mesh/iosHardwareHistoryProtocol.ts');
const uid='3F0033001250364146313320';
const arc='11111111-2222-3333-4444-555555555555';
const other='22222222-2222-3333-4444-555555555555';
test('silicon identity exact raw memory order, version/length/type/token/error rejection',()=>{
 const frame=Buffer.alloc(20);frame.set([0x79,1,0,1]);frame.writeUInt32LE(17,4);frame.set(Buffer.from(uid,'hex'),8);
 assert.equal(identity.decodeHardwareIdentity(frame,17),uid);
 for(const offset of [0,1,2,3]){const broken=Buffer.from(frame);broken[offset]=255;assert.throws(()=>identity.decodeHardwareIdentity(broken,17));}
 assert.throws(()=>identity.decodeHardwareIdentity(frame,18));assert.throws(()=>identity.decodeHardwareIdentity(frame.subarray(0,19),17));
 frame.fill(0,8);assert.throws(()=>identity.decodeHardwareIdentity(frame,17));
});
test('explicit authorized first selection, idempotent restore, UID/product conflict never overwrites',()=>{
 const binding=identity.associateHardwareBinding([],uid,arc,'owner',[arc]);
 assert.deepEqual(identity.resolveHardwareBinding(binding,uid),{state:'known',arcDeviceId:arc});
 assert.equal(identity.associateHardwareBinding(binding,uid,arc,'owner',[arc]),binding);
 assert.throws(()=>identity.associateHardwareBinding(binding,uid,other,'owner',[other]));
 assert.throws(()=>identity.associateHardwareBinding(binding,'0102030405060708090A0B0C',arc,'owner',[arc]));
 assert.throws(()=>identity.associateHardwareBinding([],uid,arc,'owner',[]));
 assert.deepEqual(identity.resolveHardwareBinding([...binding,...binding],uid),{state:'conflict'});
 assert.deepEqual(identity.resolveHardwareBinding(binding,uid,other),{state:'conflict'});
 assert.deepEqual(identity.resolveHardwareBinding([],'0102030405060708090A0B0C'),{state:'unknown'});
});
function record(){const frame=Buffer.alloc(92),r=frame.subarray(4);frame.set([0x65,3,88,0]);r.set([0x31,0,7,0]);r.writeUInt32LE(100,4);r.writeBigUInt64LE(10n,8);r.writeBigUInt64LE(20n,16);r.writeUInt32LE(7,24);r.writeUInt32LE(1700000100,28);r.writeUInt32LE(1700000099,32);r.writeUInt16LE(321,36);r.writeUInt16LE(123,38);r[58]=1;r[59]=55;r.writeInt16LE(2450,40);r.writeUInt16LE(5000,42);r.set(Buffer.from('0102030405060708090A0B0C','hex'),64);r.set(Buffer.from(uid,'hex'),76);r.writeUInt16LE(history.arcHistoryCrc16(r,62),62);return frame;}
test('new 64-byte stored / 88-byte BLE history preserves distinct identities/counters/timestamps exactly',()=>{
 const decoded=history.decodeArcHistoryRecord(record());
 assert.equal(decoded.sequence,100);assert.equal(decoded.nodeSequence,7);assert.equal(decoded.nodeGeneration,'0000000000000014');assert.equal(decoded.journalGeneration,'000000000000000A');
 assert.equal(decoded.sourceHardwareUid,'0102030405060708090A0B0C');assert.equal(decoded.lampHardwareUid,uid);
 assert.equal(decoded.measurementUnixTimeSeconds,1700000099);assert.equal(decoded.unixTimeSeconds,1700000100);
 assert.equal(decoded.measurementMilliseconds,123);assert.equal(decoded.collectionMilliseconds,321);
 assert.equal(decoded.ambientTemperatureC,24.5);assert.equal(decoded.ambientHumidityPct,50);assert.equal(decoded.batteryPct,55);
 const id=history.hardwareHistoryRecordId(decoded);assert.match(id,/generation:000000000000000A:history:100$/);
 const broken=record();broken[44]^=1;assert.throws(()=>history.decodeArcHistoryRecord(broken),/CRC/);
 assert.throws(()=>history.decodeArcHistoryRecord(Buffer.from([0x65,1,0,0])));
});
test('v3 history generation is mandatory; bounded requests and MTU-safe two-record packing',()=>{
 const batch=history.encodeArcHistoryGetBatch(-1,100,32,'000000000000000A');assert.equal(batch.length,19);assert.equal(batch[1],3);assert.equal(batch[11],10);
 assert.throws(()=>history.encodeArcHistoryGetBatch(-1,100,33,'000000000000000A'));
 assert.throws(()=>history.encodeArcHistoryGetBatch(-1,100,32,'0000000000000000'));
 const stream=Buffer.alloc(180);stream.set([0x67,3,2,0]);stream.set(record().subarray(4),4);stream.set(record().subarray(4),92);
 assert.equal(history.decodeArcHistoryStream(stream).length,2);
 stream[93]=255;assert.throws(()=>history.decodeArcHistoryStream(stream));
});
