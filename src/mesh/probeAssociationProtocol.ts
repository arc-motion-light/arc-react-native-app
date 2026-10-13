/** Probe Association v1b. Serialization never supplies device-side authority. */
export type ProbeMode = 1 | 2 | 3;
export type ProbeAssociation = { mode: ProbeMode; revision: number; parentArcId: string | null; parentHardwareUid: string | null };
export type AssociationState = 'empty' | 'committed' | 'pending' | 'denied' | 'conflict' | 'invalid' | 'busy' | 'error';
export type AssociationStatus = { state: AssociationState; token: number; committed: ProbeAssociation | null };
const states: AssociationState[] = ['empty','committed','pending','denied','conflict','invalid','busy','error'];
const integer = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const bytes = (hex: string, length: number): Uint8Array => {
  if (!new RegExp(`^[0-9a-f]{${length*2}}$`,'i').test(hex) || /^0+$/.test(hex) || /^f+$/i.test(hex)) throw new Error('Invalid parent identity');
  return Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte,16));
};
const hex = (p: Uint8Array) => Array.from(p, b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
const uuid = (p: Uint8Array) => { const h=hex(p).toLowerCase();return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; };
export const associationCrc = (p: Uint8Array): number => {let c=0xffffffff;for(const b of p){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return (~c)>>>0;};
export function associationGet(token: number): Uint8Array {
  if (!integer(token) || token===0) throw new Error('Invalid token');const p=new Uint8Array(8);p.set([0x73,1]);new DataView(p.buffer).setUint32(4,token,true);return p;
}
export function associationSet(token: number, expected: number, desired: ProbeAssociation, maximumWriteBytes: number): Uint8Array {
  if (!integer(expected) || expected===0xffffffff || desired.revision!==expected+1 || ![1,2,3].includes(desired.mode)) throw new Error('Invalid association revision or mode');
  if (!Number.isInteger(maximumWriteBytes) || maximumWriteBytes<60) throw new Error('Native BLE write capacity of 60 bytes is required');
  const p=new Uint8Array(60);p.set(associationGet(token));p[0]=0x74;const view=new DataView(p.buffer);view.setUint32(8,expected,true);
  p.set([65,82,67,65,1,desired.mode],12);view.setUint32(20,desired.revision,true);
  if (desired.mode===1) {if(desired.parentArcId!==null||desired.parentHardwareUid!==null)throw new Error('DIRECT has no logical parent');}
  else {if(!desired.parentArcId||!desired.parentHardwareUid||!/^([a-f0-9]{8}-)([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(desired.parentArcId))throw new Error('Parent identity required');p.set(bytes(desired.parentArcId.replace(/-/g,''),16),24);p.set(bytes(desired.parentHardwareUid,12),40);}
  view.setUint32(52,associationCrc(p.subarray(12,52)),true);return p;
}
export function associationStatus(p: Uint8Array, expectedToken: number): AssociationStatus {
  if(p.length!==40||p[0]!==0x75||p[1]!==1||p[2]>=states.length)throw new Error('Invalid association response');
  const v=new DataView(p.buffer,p.byteOffset,p.byteLength),token=v.getUint32(4,true),revision=v.getUint32(8,true);
  if(token!==expectedToken)throw new Error('Stale association token');
  const state=states[p[2]];
  if(state==='denied'||state==='invalid'||state==='empty') {if(p[3]||revision||p.subarray(12).some(Boolean))throw new Error('Unexpected private association data');return {state,token,committed:null};}
  if(!revision) {if(p[3]||p.subarray(12).some(Boolean)||state==='committed')throw new Error('Invalid committed association');return {state,token,committed:null};}
  if(![1,2,3].includes(p[3]))throw new Error('Invalid committed mode');
  const mode=p[3] as ProbeMode;
  if(mode===1) {if(p.subarray(12).some(Boolean))throw new Error('DIRECT cannot carry a parent');return {state,token,committed:{mode,revision,parentArcId:null,parentHardwareUid:null}};}
  bytes(hex(p.subarray(12,28)),16);bytes(hex(p.subarray(28)),12);
  return {state,token,committed:{mode,revision,parentArcId:uuid(p.subarray(12,28)),parentHardwareUid:hex(p.subarray(28))}};
}
/** A response belongs to exactly one native BLE connection and one operation. */
export class AssociationOperation {
  private active: {nodeId: string;session: number;token: number;expires: number}|null=null;
  begin(nodeId: string, session: number, token: number, now: number, timeout=5000): void {
    if(this.active)throw new Error('Association operation already pending');
    if(!nodeId||!integer(session)||!integer(token)||!token||!Number.isFinite(now)||timeout<=0)throw new Error('Invalid BLE operation');
    this.active={nodeId,session,token,expires:now+timeout};
  }
  receive(nodeId: string, session: number, p: Uint8Array, now: number): AssociationStatus|null {
    const a=this.active;if(!a||nodeId!==a.nodeId||session!==a.session)return null;
    if(now>=a.expires){this.active=null;throw new Error('Association response timed out');}
    if(p.length<8||p[0]!==0x75||new DataView(p.buffer,p.byteOffset,p.byteLength).getUint32(4,true)!==a.token)return null;
    const result=associationStatus(p,a.token);this.active=null;return result;
  }
  disconnect(nodeId: string, session: number): void {if(this.active?.nodeId===nodeId&&this.active.session===session)this.active=null;}
}
