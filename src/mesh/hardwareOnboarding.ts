import { hardwareUid, type HardwareIdentityEvent } from './hardwareIdentity';
import type { PortalDeviceSummary } from '../cloud/portalTypes';
export type ProductType = 'lamp' | 'probe' | 'gateway';
export type ServerHardwareBinding = { hardwareUid:string;arcDeviceId:string;deviceType:ProductType };
export type BindingResult = { binding:ServerHardwareBinding;device:PortalDeviceSummary;authorizedUserId?:string;issuedAtMs?:number;expiresAtMs?:number;permissionSource?:'native_secure_receipt';permissionExpiresAtMs?:number };
export interface OnboardingBackend {
 account():string|null;
 resolve(uid:string):Promise<BindingResult|null>;
 devices():Promise<PortalDeviceSummary[]>;
 confirm(uid:string,deviceId:string,deviceType:ProductType):Promise<BindingResult>;
}
export type OnboardingState = {
 nodeId:string;session:number;phase:'identifying'|'resolving'|'select'|'saving'|'ready'|'error'|'disconnected';
 hardwareUid?:string;deviceType?:ProductType;candidates?:PortalDeviceSummary[];binding?:ServerHardwareBinding;device?:PortalDeviceSummary;error?:string;errorCode?:string;errorStatus?:number;permissionSource?:'native_secure_receipt';permissionExpiresAtMs?:number;
 appAssociationCompleted:boolean;deviceAuthorizationCompleted:false;
};
/** Backend-confirmed mapping and device-side authorization are separate outcomes. */
export class HardwareOnboarding {
 private states=new Map<string,OnboardingState>();
 constructor(private backend:OnboardingBackend,private changed:(states:OnboardingState[])=>void){}
 snapshot(){return [...this.states.values()].map(s=>({...s}));}
 private put(s:OnboardingState){this.states.set(s.nodeId,s);this.changed(this.snapshot());}
 private current(s:OnboardingState){return this.states.get(s.nodeId)===s;}
 private fail(s:OnboardingState,error:unknown){if(this.current(s))this.put({...s,phase:'error',error:error instanceof Error?error.message:String(error),errorCode:(error as {code?:string})?.code,errorStatus:(error as {status?:number})?.status,appAssociationCompleted:false});}
 private validated(result:BindingResult,uid:string,kind:ProductType){
  if(result.binding.hardwareUid!==uid||result.binding.deviceType!==kind||result.device.id!==result.binding.arcDeviceId||result.device.type!==kind)throw new Error('Conflicting hardware / ARC identity');
 }
 async identity(event:HardwareIdentityEvent){
  if(!event.nodeId||!Number.isInteger(event.session)||event.session<=0)return;
  const prior=this.states.get(event.nodeId);
  if(prior&&event.session<prior.session)return;
  if(event.state==='disconnected'){this.cancel(event.nodeId);return;}
  if(event.state==='pending'){
   if(prior&&prior.session===event.session&&prior.phase!=='disconnected')return;
   this.put({nodeId:event.nodeId,session:event.session,phase:'identifying',appAssociationCompleted:false,deviceAuthorizationCompleted:false});return;
  }
  if(!prior||prior.session!==event.session||prior.phase!=='identifying')return;
  if(event.state!=='identified'){this.fail(prior,new Error(`Hardware identity ${event.state}. No MAC/name/UUID fallback is allowed.`));return;}
  const uid=hardwareUid(event.hardwareUid),kind=event.deviceType,account=this.backend.account();
  if(!uid||(kind!=='lamp'&&kind!=='probe')){this.fail(prior,new Error('Unsupported or invalid hardware identity'));return;}
  const state:OnboardingState={...prior,phase:'resolving',hardwareUid:uid,deviceType:kind};this.put(state);
  try{
   if(!account)throw new Error('Sign in with a verified ARC account before associating hardware');
   const result=await this.backend.resolve(uid);if(!this.current(state)||this.backend.account()!==account)return;
   if(result){this.validated(result,uid,kind);this.put({...state,phase:'ready',binding:result.binding,device:result.device,permissionSource:result.permissionSource,permissionExpiresAtMs:result.permissionExpiresAtMs,appAssociationCompleted:true});return;}
   const devices=await this.backend.devices();if(!this.current(state)||this.backend.account()!==account)return;
   const candidates=devices.filter(d=>d.type===kind&&d.access.isOwner&&d.owner.uid===account);
   const ids=new Set(candidates.map(d=>d.id));if(ids.size!==candidates.length)throw new Error('Ambiguous claimed-device inventory');
   // Even one candidate requires an explicit user selection; never auto-bind.
   this.put({...state,phase:'select',candidates});
  }catch(error){this.fail(state,error);}
 }
 async select(nodeId:string,deviceId:string){
  const prior=this.states.get(nodeId),account=this.backend.account();
  if(!prior||prior.phase!=='select'||!prior.hardwareUid||!prior.deviceType||!account||!prior.candidates?.some(d=>d.id===deviceId&&d.owner.uid===account&&d.access.isOwner))throw new Error('Explicit eligible selection required');
  const state:OnboardingState={...prior,phase:'saving'};this.put(state);
  try{
   const result=await this.backend.confirm(prior.hardwareUid,deviceId,prior.deviceType);
   if(!this.current(state)||this.backend.account()!==account)return;
   this.validated(result,prior.hardwareUid,prior.deviceType);
   if(result.binding.arcDeviceId!==deviceId)throw new Error('Conflicting selected ARC device');
   this.put({...state,phase:'ready',binding:result.binding,device:result.device,permissionSource:result.permissionSource,permissionExpiresAtMs:result.permissionExpiresAtMs,appAssociationCompleted:true});
  }catch(error){this.fail(state,error);}
 }
 cancel(nodeId:string){const s=this.states.get(nodeId);if(s)this.put({...s,phase:'disconnected',appAssociationCompleted:false});}
 retry(nodeId:string){const s=this.states.get(nodeId);if(!s||!s.hardwareUid||!s.deviceType)return;this.put({...s,phase:'identifying',error:undefined,errorCode:undefined,errorStatus:undefined});return this.identity({nodeId,session:s.session,state:'identified',hardwareUid:s.hardwareUid,deviceType:s.deviceType==='gateway'?undefined:s.deviceType});}
 reset(){this.states.clear();this.changed([]);}
}
