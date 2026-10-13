import type { OnboardingState } from './hardwareOnboarding';
export const shouldPresentHardwareAssociation = (state:OnboardingState|undefined):boolean => Boolean(state&&(state.phase==='select'||state.phase==='error'));
export type OnboardingMessage = {title:string;message:string};
/** Ownership mismatch is reported only from an explicit server reason, never a network failure. */
export const onboardingMessage = (error:unknown):OnboardingMessage => {
 const value=error as {code?:string;status?:number;message?:string};const text=String(value?.message??error??'').toLowerCase();
 if(text.includes('hardware identity')||text.includes('invalid hardware'))return {title:'Device identity unavailable',message:'ARC could not verify the device identity. Reconnect and try again; your saved association is retained.'};
 if(value?.code==='DEVICE_CLAIMED_BY_OTHER')return {title:'Device belongs to another account',message:'Ask its owner to share or transfer this device through ARC.'};
 if(value?.status===403||text.includes('revoked')||text.includes('permission'))return {title:'Access needs attention',message:'Your saved association is retained. Check My Devices or refresh your ARC permissions.'};
 if(value?.status===503||text.includes('network')||text.includes('timeout')||text.includes('unavailable')||text.includes('fetch'))return {title:'ARC is temporarily unavailable',message:'Your association is retained. Try again when a connection is available.'};
 if(text.includes('expired')||text.includes('receipt'))return {title:'Refresh device access',message:'Your device identity is retained. Connect online to refresh access; no new claim is needed.'};
 return {title:'Device not recognized',message:"This device isn't linked to your ARC account. Check My Devices or add the device before connecting."};
};
