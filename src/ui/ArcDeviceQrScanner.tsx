// Non-iOS resolver: no camera dependency is loaded into the paused Android app.
// The iOS implementation is selected by Metro's .ios.tsx platform resolution.
import React from 'react';
import type { ArcPublicDeviceQr } from '../arc/arcDeviceQr';
export function ArcDeviceQrScanner(_props: {visible:boolean;onCancel:()=>void;onScanned:(value:ArcPublicDeviceQr)=>void;onDismissed?:()=>void}) {
  return null;
}
