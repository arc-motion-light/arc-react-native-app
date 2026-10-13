import type { ProbeLogEnvelope } from '../probeDataFormat';
import { isProbeUtcMs } from '../mesh/probeSampleTimeProtocol';
/** Verified record time only. Missing validity is not upgraded; explicitly invalid/phone/unknown time is never plotted. */
export const probeRecordedTimestamp = (record: ProbeLogEnvelope): number | null => {
  const time=record.timeline;
  if(record.raw?.snapshot?.timestampValid===false || time.timestampValid!==true || time.timestampOrigin==='phone_received' || time.timestampOrigin==='unknown')return null;
  return isProbeUtcMs(time.deviceTimestampMs)?time.deviceTimestampMs:null;
};
export const selectRecordedProbePoints = (records:ProbeLogEnvelope[],start:number,end:number) => {
  const seen=new Set<string>();
  return records.flatMap(record=>{
    const timestampMs=probeRecordedTimestamp(record);if(timestampMs===null||timestampMs<start||timestampMs>end)return [];
    const snapshot=record.raw?.snapshot;
    const sampleId=snapshot?.sampleHardwareUid!=null&&snapshot.sampleSequence!=null&&snapshot.sampleTickMs!=null
      ?`${snapshot.sampleHardwareUid}:${snapshot.sampleSequence}:${snapshot.sampleTickMs}:${timestampMs}`:record.recordId;
    if(seen.has(sampleId))return [];seen.add(sampleId);return [{record,timestampMs}];
  }).sort((a,b)=>a.timestampMs-b.timestampMs||a.record.recordId.localeCompare(b.record.recordId));
};
