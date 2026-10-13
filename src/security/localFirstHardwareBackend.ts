import type {BindingResult,OnboardingBackend,ProductType} from '../mesh/hardwareOnboarding';
export interface OfflinePermissionStore {
 read(subject:string,uid:string):Promise<BindingResult|null>;
 saveAuthenticated(subject:string,result:BindingResult):Promise<BindingResult>;
 revoke(subject:string,uid:string):Promise<void>;
}
export function localFirstHardwareBackend(options:{
 account:()=>string|null;known:(uid:string)=>boolean;consistent:(uid:string,result:BindingResult)=>boolean;
 store:OfflinePermissionStore;resolveOnline:(uid:string)=>Promise<BindingResult|null>;
 devicesOnline:OnboardingBackend['devices'];confirmOnline:(uid:string,id:string,type:ProductType)=>Promise<BindingResult>;
 revoked:(error:unknown)=>boolean;
}) {
 const explicitRefresh=new Set<string>();
 return {
  account:options.account,
  refreshNext(uid:string){explicitRefresh.add(uid);},
  async resolve(uid:string){
   const subject=options.account();if(!subject)throw new Error('Sign in before commissioning');
   const refresh=explicitRefresh.delete(uid);
   if(!refresh){
    const cached=await options.store.read(subject,uid);
    if(cached){if(!options.consistent(uid,cached))throw new Error('Stored hardware identity conflict');return cached;}
    if(options.known(uid))throw new Error('Hardware binding remains available offline; local permission receipt is missing. Explicitly refresh online.');
   }
   try{
    const result=await options.resolveOnline(uid);
    if(!result)return null;
    if(!options.consistent(uid,result))throw new Error('Stored hardware identity conflict');
    return options.store.saveAuthenticated(subject,result);
   }catch(error){if(options.revoked(error))await options.store.revoke(subject,uid);throw error;}
  },
  devices:options.devicesOnline,
  async confirm(uid:string,id:string,type:ProductType){
   const subject=options.account();if(!subject)throw new Error('Sign in before commissioning');
   const result=await options.confirmOnline(uid,id,type);
   if(!options.consistent(uid,result))throw new Error('Stored hardware identity conflict');
   return options.store.saveAuthenticated(subject,result);
  },
 } satisfies OnboardingBackend & {refreshNext:(uid:string)=>void};
}
