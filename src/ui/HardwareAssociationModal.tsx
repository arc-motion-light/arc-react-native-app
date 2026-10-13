import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { shouldPresentHardwareAssociation, onboardingMessage } from '../mesh/onboardingPresentation';
import type { OnboardingState } from '../mesh/hardwareOnboarding';
export function HardwareAssociationModal({state,onSelect,onCancel,onRefresh,onMyDevices}:{state:OnboardingState|undefined;onSelect:(id:string)=>void;onCancel:()=>void;onRefresh:()=>void;onMyDevices?:()=>void}){
 if(!state||!shouldPresentHardwareAssociation(state))return null;
 const problem=onboardingMessage({message:state.error,code:state.errorCode,status:state.errorStatus});
 const waiting=['identifying','resolving','saving'].includes(state.phase);
 return <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
  <View style={styles.backdrop}><View style={styles.panel}>
   <Text style={styles.title}>{state.phase==='error'?problem.title:'Identify this ARC device'}</Text>
   <Text style={styles.text}>Hardware UID: {state.hardwareUid??'Waiting for the device response'}</Text>
   {waiting?<Text style={styles.text}>{state.phase==='saving'?'Confirming the factory hardware binding…':'Reading identity and current ARC permissions…'}</Text>:null}
   {state.phase==='error'?<><Text style={styles.error}>{problem.message}</Text><TouchableOpacity style={styles.choice} onPress={onRefresh}><Text style={styles.text}>Try Again</Text></TouchableOpacity></>:null}
   {state.phase==='select'?<><Text style={styles.text}>Select the existing claimed {state.deviceType}. This does not change its operating mode.</Text>
    <ScrollView style={styles.list}>{state.candidates?.map(d=><TouchableOpacity key={d.id} style={styles.choice} onPress={()=>onSelect(d.id)} accessibilityRole="button"><Text style={styles.text}>{d.displayName}</Text><Text style={styles.small}>{d.id}</Text></TouchableOpacity>)}</ScrollView>
    {!state.candidates?.length?<Text style={styles.text}>No eligible claimed devices. Disconnect and use the existing Device claiming workflow first. Shared access can restore an existing binding; creating one requires the owner.</Text>:null}
   </>:null}
   {onMyDevices?<TouchableOpacity style={styles.choice} onPress={onMyDevices}><Text style={styles.text}>My Devices</Text></TouchableOpacity>:null}
   <Text style={styles.small}>ARC identity binding is separate from firmware authorization. A physical UID is identification, not a credential.</Text>
   <TouchableOpacity style={styles.choice} onPress={onCancel} accessibilityRole="button"><Text style={styles.text}>Disconnect / cancel</Text></TouchableOpacity>
  </View></View>
 </Modal>;
}
const styles=StyleSheet.create({backdrop:{flex:1,backgroundColor:'#0009',alignItems:'center',justifyContent:'center',padding:20},panel:{backgroundColor:'#17202c',borderRadius:14,padding:20,width:'100%',maxWidth:520,gap:14},title:{fontSize:20,fontWeight:'600',color:'#fff'},text:{color:'#fff',fontSize:15},small:{color:'#b3bdc9',fontSize:12},error:{color:'#ffb2a8'},list:{maxHeight:300},choice:{padding:12,borderWidth:1,borderColor:'#687487',borderRadius:8,marginTop:8}});
