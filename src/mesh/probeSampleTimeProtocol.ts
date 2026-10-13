import type { ProbeSensorStatus } from './meshTypes';
import type { ArcProbeTelemetryStatus } from './arcMeshProtocol';
export const PROBE_SAMPLE_TIME_OPCODE = 0x24;
export const PROBE_SAMPLE_TIME_BYTES = 36;
export const MIN_PROBE_UTC_MS = 1577836800000;
export const MAX_PROBE_UTC_MS = 4102444799999;
export const isProbeUtcMs = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= MIN_PROBE_UTC_MS && value <= MAX_PROBE_UTC_MS;
export const probePayloadCrc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc ^ 0xffffffff) >>> 0;
};
export type ProbeSampleTime = { sequence: number; tickMs: number; timestampValid: boolean; deviceTimestampMs: number | null; hardwareUid: string; payloadCrc32: number };
export const decodeProbeSampleTime = (data: Uint8Array): ProbeSampleTime => {
  if (data.length!==36 || data[0]!==0x24 || data[1]!==1 || (data[2]&~1)!==0 || data[3]!==0 || data[18]!==0 || data[19]!==0) throw new Error('Invalid Probe sample time frame');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  const seconds=view.getUint32(12,true), milliseconds=view.getUint16(16,true), valid=(data[2]&1)!==0;
  const uid=Array.from(data.subarray(20,32), b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
  if (/^(0{24}|F{24})$/.test(uid) || milliseconds>999 || (valid ? !isProbeUtcMs(seconds*1000+milliseconds) : seconds!==0 || milliseconds!==0)) throw new Error('Invalid Probe sample time metadata');
  return {sequence:view.getUint32(4,true),tickMs:view.getUint32(8,true),timestampValid:valid,deviceTimestampMs:valid?seconds*1000+milliseconds:null,hardwareUid:uid,payloadCrc32:view.getUint32(32,true)};
};
/** Direct iOS sample correlation. Identity is stream binding, never ownership proof.
 * Sidecar precedes telemetry. Late metadata never rewrites retained old samples. */
export class ProbeSampleTimeJoiner {
  private connected=new Map<string,boolean>();
  private sessions=new Map<string,number>();
  connection(nodeId:string,connected:boolean){this.connected.set(nodeId,connected);this.reset(nodeId);}
  private bindings=new Map<string,{uid:string;session:number;relay:boolean}>();
  private times=new Map<string,Map<string,{time:ProbeSampleTime;receivedAtMs:number;ambiguous:boolean}>>();
  reset(nodeId:string){this.bindings.delete(nodeId);this.times.delete(nodeId);}
  identity(nodeId:string, uid:string|undefined, session:number, identified:boolean,relay=false){
    const old=this.bindings.get(nodeId);
    if(session<(this.sessions.get(nodeId)??-1))return;
    this.sessions.set(nodeId,session);
    if(identified&&this.connected.get(nodeId)===false)return;
    if(!identified || !uid || !/^[0-9A-F]{24}$/.test(uid)){this.reset(nodeId);return;}
    if(!old||old.session!==session||old.uid!==uid)this.times.delete(nodeId);
    this.bindings.set(nodeId,{uid,session,relay});
  }
  receive(nodeId:string,data:Uint8Array,now:number){
    const time=decodeProbeSampleTime(data),binding=this.bindings.get(nodeId);
    if(!binding||(!binding.relay&&time.hardwareUid!==binding.uid))return;
    const rows=this.times.get(nodeId)??new Map();
    const key=`${time.sequence}:${time.tickMs}:${time.payloadCrc32}`,previous=rows.get(key);
    const contradictory=previous&&now-previous.receivedAtMs<=5000&&(previous.time.hardwareUid!==time.hardwareUid||previous.time.deviceTimestampMs!==time.deviceTimestampMs||previous.time.timestampValid!==time.timestampValid);
    rows.set(key,{time,receivedAtMs:now,ambiguous:Boolean(contradictory||previous?.ambiguous)});
    while(rows.size>8)rows.delete(rows.keys().next().value!);
    this.times.set(nodeId,rows);
  }
  decorate(nodeId:string,status:ProbeSensorStatus,frame:ArcProbeTelemetryStatus,payload:Uint8Array,now:number):ProbeSensorStatus {
    const binding=this.bindings.get(nodeId),rows=this.times.get(nodeId),key=`${frame.sequence}:${frame.tickMs}:${probePayloadCrc32(payload)}`;
    const row=rows?.get(key);rows?.delete(key);
    const time=row&&!row.ambiguous&&binding&&(binding.relay||row.time.hardwareUid===binding.uid)&&now>=row.receivedAtMs&&now-row.receivedAtMs<=5000?row.time:null;
    return {...status,source:binding&&!binding.relay?'probe-native':status.source,sampleSequence:frame.sequence,sampleTickMs:frame.tickMs,sensorValidMask:frame.sensorValidMask,sensorErrorMask:frame.sensorErrorMask,
      deviceTimestampMs:time?.deviceTimestampMs??null,timestampValid:time?.timestampValid===true,timestampOrigin:time?.timestampValid?'probe_device':'unknown',
      sampleTimePresent:time!==null,
      sampleHardwareUid:time?.hardwareUid??(binding?.relay?undefined:binding?.uid),
      sampleRecordId:binding?`probe:${time?.hardwareUid??binding.uid}:${time?.timestampValid?`utc:${time.deviceTimestampMs}`:`session:${binding.session}`}:sample:${frame.sequence}:${frame.tickMs}`:undefined};
  }
}
