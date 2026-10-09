import type { DeviceAccess, PortalDeviceSummary } from './portalTypes';

const accessOf = (deviceOrAccess: PortalDeviceSummary | DeviceAccess): DeviceAccess =>
  'access' in deviceOrAccess ? deviceOrAccess.access : deviceOrAccess;

export const canOpenLatest = (device: PortalDeviceSummary) => accessOf(device).canViewTelemetry;
export const canOpenHistory = (device: PortalDeviceSummary) => accessOf(device).canViewHistory;
export const canTrackDevice = (device: PortalDeviceSummary) => accessOf(device).canTrack;
export const canControlDevice = (device: PortalDeviceSummary) => accessOf(device).canControl;
export const canEditDevice = (device: PortalDeviceSummary) => accessOf(device).canEditSettings;
export const canShareDevice = (device: PortalDeviceSummary) => accessOf(device).canShare;
export const isOwnedDevice = (device: PortalDeviceSummary) => accessOf(device).isOwner;
