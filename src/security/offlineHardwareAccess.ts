import type { BindingResult } from '../mesh/hardwareOnboarding';
import type { DeviceAccess } from '../cloud/portalTypes';
/** App-scoped backend receipt. Only the native OS-protected store is trusted.
 * This is NOT a portable signed grant or a firmware authorization credential. */
export type OfflineAccessReceipt = {version:1;subjectUid:string;issuedAtMs:number;expiresAtMs:number;lastCheckedAtMs:number;binding:BindingResult['binding'];device:BindingResult['device']};
export const OWNER_OFFLINE_WINDOW_MS=30*24*60*60*1000;
export const SHARED_OFFLINE_WINDOW_MS=7*24*60*60*1000;
const permissions: (keyof DeviceAccess)[]=['isOwner','canViewTelemetry','canViewHistory','canTrack','canControl','canEditSettings','canShare'];
export function validateOfflineAccess(value:unknown,subject:string,uid:string,now:number):OfflineAccessReceipt {
 const r=value as OfflineAccessReceipt;
 if(!r||r.version!==1||r.subjectUid!==subject||r.binding?.hardwareUid!==uid||r.device?.id!==r.binding.arcDeviceId||r.device?.type!==r.binding.deviceType||
   !/^[0-9A-F]{24}$/.test(uid)||/^(0{24}|F{24})$/.test(uid)||!['lamp','probe','gateway'].includes(r.binding.deviceType)||
   permissions.some(p=>typeof r.device?.access?.[p]!=='boolean'))throw new Error('Missing or invalid local permission receipt');
 if(r.device.access.isOwner&&r.device.owner.uid!==subject)throw new Error('Local receipt account mismatch');
 const maximum=r.device.access.isOwner?OWNER_OFFLINE_WINDOW_MS:SHARED_OFFLINE_WINDOW_MS;
 if(![r.issuedAtMs,r.expiresAtMs,r.lastCheckedAtMs,now].every(Number.isSafeInteger)||r.issuedAtMs<=0||r.expiresAtMs<=r.issuedAtMs||
   r.expiresAtMs-r.issuedAtMs>maximum||r.lastCheckedAtMs<r.issuedAtMs||now+300000<r.lastCheckedAtMs)throw new Error('Local credential clock or validity error');
 if(Math.max(now,r.lastCheckedAtMs)>=r.expiresAtMs)throw new Error('Local permission receipt expired; explicitly refresh online');
 return {...r,lastCheckedAtMs:Math.max(now,r.lastCheckedAtMs)};
}
export interface NativeSecureReceiptStore {get(key:string):Promise<string|null>;set(key:string,value:string):Promise<void>;remove(key:string):Promise<void>}
const permissionsIndex=(subject:string)=>`arc.hw.access.index.v1.${subjectKey(subject)}`;
const subjectKey=(subject:string)=>Array.from(subject,c=>c.codePointAt(0)!.toString(16).padStart(6,'0')).join('');
export const receiptKey=(subject:string,uid:string)=>`arc.hw.access.v1.${subjectKey(subject)}.${uid}`;
export function createOfflineAccessStore(store:NativeSecureReceiptStore,clock=()=>Date.now()) {
 async function registered(subject:string){const raw=await store.get(permissionsIndex(subject));if(!raw)return [];const list:unknown=JSON.parse(raw);if(!Array.isArray(list)||list.some(uid=>typeof uid!=='string'||!/^[0-9A-F]{24}$/.test(uid)))throw new Error('Invalid protected receipt index');return list as string[];}
 return {
  async read(subject:string,uid:string):Promise<BindingResult|null>{
   const key=receiptKey(subject,uid),raw=await store.get(key);if(raw===null)return null;
   const r=validateOfflineAccess(JSON.parse(raw),subject,uid,clock());await store.set(key,JSON.stringify(r));
   return {binding:r.binding,device:r.device,permissionSource:'native_secure_receipt',permissionExpiresAtMs:r.expiresAtMs};
  },
  async saveAuthenticated(subject:string,result:BindingResult):Promise<BindingResult>{
   // Called exclusively with the authenticated Portal endpoint result, never BLE fields.
   if(result.authorizedUserId!==subject||!result.issuedAtMs||!result.expiresAtMs)throw new Error('Backend receipt scope/time missing');
   const minimal={...result.device,latestTelemetry:undefined,confirmedSchedule:undefined};
   const r:OfflineAccessReceipt={version:1,subjectUid:subject,issuedAtMs:result.issuedAtMs,expiresAtMs:result.expiresAtMs,lastCheckedAtMs:result.issuedAtMs,binding:result.binding,device:minimal};
   const valid=validateOfflineAccess(r,subject,result.binding.hardwareUid,clock());
   const list=await registered(subject);if(!list.includes(result.binding.hardwareUid))await store.set(permissionsIndex(subject),JSON.stringify([...list,result.binding.hardwareUid]));
   await store.set(receiptKey(subject,result.binding.hardwareUid),JSON.stringify(valid));
   return {...result,permissionSource:'native_secure_receipt',permissionExpiresAtMs:valid.expiresAtMs};
  },
  async clearSubject(subject:string){const list=await registered(subject);for(const uid of list)await store.remove(receiptKey(subject,uid));await store.remove(permissionsIndex(subject));},
  async narrowFromFreshInventory(subject:string,devices:BindingResult['device'][]){
   const list=await registered(subject);const affected:string[]=[];
   for(const uid of list){const key=receiptKey(subject,uid),raw=await store.get(key);if(!raw)continue;
    let r:OfflineAccessReceipt;try{r=validateOfflineAccess(JSON.parse(raw),subject,uid,clock());}catch{await store.remove(key);affected.push(uid);continue;}
    const current=devices.find(d=>d.id===r.binding.arcDeviceId&&d.type===r.binding.deviceType);
    if(!current){await store.remove(key);affected.push(uid);continue;}
    const narrowed={...r.device.access};for(const flag of permissions)narrowed[flag]=narrowed[flag]&&current.access[flag]===true;
    if(permissions.some(flag=>narrowed[flag]!==r.device.access[flag])||current.owner.uid!==r.device.owner.uid){
     r={...r,device:{...r.device,owner:current.owner,access:narrowed},expiresAtMs:Math.min(r.expiresAtMs,r.issuedAtMs+(narrowed.isOwner?OWNER_OFFLINE_WINDOW_MS:SHARED_OFFLINE_WINDOW_MS))};
     await store.set(key,JSON.stringify(r));affected.push(uid);
    }
   }return affected;
  },
  async revoke(subject:string,uid:string){await store.remove(receiptKey(subject,uid));},
 };
}
