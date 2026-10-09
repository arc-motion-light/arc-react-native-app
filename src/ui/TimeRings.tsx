import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ControlPad } from './ControlPad';
import { DayCycleRing } from './DayCycleRing';
import { ScheduleRing } from './ScheduleRing';
import { useControlSizing } from './useControlSizing';
import { TimeFormat } from './timeUtils';
import { useAppTheme } from './theme';
import type { AppTheme } from './theme';

type DayCycle = {
  sunrise: number;
  sunset: number;
};

type LampSchedule = {
  on: number;
  off: number;
  hueFadeStart: number;
  hueFadeDuration: number;
  morningFade: number;
  nightFade: number;
};

type TimeRingsProps = {
  dayCycle: DayCycle;
  schedule: LampSchedule;
  scheduleEnabled: boolean;
  nowMinutes: number;
  timeFormat: TimeFormat;
  hasLocation?: boolean;
} & React.ComponentProps<typeof ControlPad>;

export const TimeRings = ({ dayCycle, schedule, scheduleEnabled, nowMinutes, timeFormat, hasLocation = true, ...controlPadProps }: TimeRingsProps) => {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    dayRingDiameter,
    scheduleRingDiameter,
    dayRingStroke,
    scheduleRingStroke,
    arcDiameter,
  } = useControlSizing();

  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const daylightMinutes = useMemo(() => {
    const raw = (dayCycle.sunset - dayCycle.sunrise + 1440) % 1440;
    return raw === 0 ? 1440 : raw;
  }, [dayCycle.sunrise, dayCycle.sunset]);

  const tooltipText = useMemo(() => {
    if (!hasLocation) return 'Sunlight: --';
    const hours = Math.floor(daylightMinutes / 60);
    const minutes = daylightMinutes % 60;
    return `Sunlight: ${hours}h ${String(minutes).padStart(2, '0')}m`;
  }, [daylightMinutes, hasLocation]);

  const showTooltip = () => {
    setTooltipVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setTooltipVisible(false), 2500);
  };

  const containerSize = Math.max(scheduleRingDiameter, dayRingDiameter, arcDiameter);

  return (
    <Pressable
      style={[styles.container, { width: containerSize, height: containerSize }]}
      onLongPress={showTooltip}
    >
      <DayCycleRing
        size={dayRingDiameter}
        strokeWidth={dayRingStroke}
        dayCycle={dayCycle}
        nowMinutes={nowMinutes}
        timeFormat={timeFormat}
        hasLocation={hasLocation}
      />
      {scheduleEnabled ? (
        <ScheduleRing
          size={scheduleRingDiameter}
          strokeWidth={scheduleRingStroke}
          schedule={schedule}
          timeFormat={timeFormat}
        />
      ) : null}
      <View style={[styles.controlWrap, { width: arcDiameter, height: arcDiameter }]}> 
        <ControlPad {...controlPadProps} />
      </View>
      {tooltipVisible ? (
        <View style={styles.tooltip} pointerEvents="none">
          <Text style={styles.tooltipText}>{tooltipText}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  tooltipText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
  },
});
