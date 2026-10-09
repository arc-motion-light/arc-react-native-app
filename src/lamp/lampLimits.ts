// Conservative integration/bench limit. STSPIN32G4 must enforce the same or a lower limit.
export const MAX_LAMP_INTENSITY_PERCENT = 50;

export const clampLampIntensity = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_LAMP_INTENSITY_PERCENT, Math.max(0, Math.round(value)));
};
