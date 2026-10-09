import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

type ControlSizing = {
  sizeKey: 'phone' | 'smallTablet' | 'largeTablet';
  centerDiameter: number;
  progressDiameter: number;
  arcDiameter: number;
  arcStroke: number;
  progressStroke: number;
  thumbRadius: number;
  cornerIconSize: number;
  dayRingDiameter: number;
  scheduleRingDiameter: number;
  dayRingStroke: number;
  scheduleRingStroke: number;
  containerHeight: number;
};

const getSizeKey = (width: number) => {
  if (width < 600) return 'phone' as const;
  if (width < 900) return 'smallTablet' as const;
  return 'largeTablet' as const;
};

export const useControlSizing = (): ControlSizing => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const SCALE = 0.9;
    const sizeKey = getSizeKey(width);

    const presets = {
      phone: {
        centerDiameter: 99,
        progressDiameter: 160,
        arcDiameter: 221,
        arcStroke: 16,
        progressStroke: 8,
        thumbRadius: 13,
        cornerIconSize: 30,
      },
      smallTablet: {
        centerDiameter: 117,
        progressDiameter: 190,
        arcDiameter: 312,
        arcStroke: 18,
        progressStroke: 8,
        thumbRadius: 16,
        cornerIconSize: 34,
      },
      largeTablet: {
        centerDiameter: 143,
        progressDiameter: 230,
        arcDiameter: 312,
        arcStroke: 21,
        progressStroke: 9,
        thumbRadius: 18,
        cornerIconSize: 38,
      },
    };

    const preset = presets[sizeKey];
    const scaledPreset = {
      ...preset,
      centerDiameter: Math.round(preset.centerDiameter * SCALE),
      progressDiameter: Math.round(preset.progressDiameter * SCALE),
      arcDiameter: Math.round(preset.arcDiameter * SCALE),
      arcStroke: Math.max(1, Math.round(preset.arcStroke * SCALE)),
      progressStroke: Math.max(1, Math.round(preset.progressStroke * SCALE)),
      thumbRadius: Math.max(1, Math.round(preset.thumbRadius * SCALE)),
    };

    return {
      sizeKey,
      ...scaledPreset,
      dayRingDiameter: scaledPreset.arcDiameter + Math.round(scaledPreset.arcStroke * 4 + 48 * SCALE),
      scheduleRingDiameter: scaledPreset.arcDiameter + Math.round(scaledPreset.arcStroke * 5 + 72 * SCALE),
      dayRingStroke: Math.max(6, Math.round(scaledPreset.arcStroke * 0.9)),
      scheduleRingStroke: Math.max(5, Math.round(scaledPreset.arcStroke * 0.65)),
      containerHeight: Math.max(height * 0.45, scaledPreset.arcDiameter + Math.round(80 * SCALE)),
    };
  }, [width, height]);
};
