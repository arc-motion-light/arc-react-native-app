import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import {
  Canvas,
  Circle,
  Path,
  Skia,
} from '@shopify/react-native-skia';
import { Easing, cancelAnimation, runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { ArcSlider } from './ArcSlider';
import { SPACING, TYPOGRAPHY, useAppTheme } from './theme';
import type { AppTheme } from './theme';
import { useControlSizing } from './useControlSizing';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved';

type ControlPadProps = {
  connected: boolean;
  power: boolean;
  powerKnown?: boolean;
  pendingPower: boolean;
  /** Requested optical output, expressed in watts. */
  intensity: number;
  /** Independent safety ceiling for the requested output. */
  powerCeilingWatts: number;
  /** Applied/selected spectral centroid, normalized blue (0) to red (1). */
  hue: number;
  saveState: SaveState;
  onPowerToggle: (next: boolean) => void;
  onIntensityChange: (value: number) => void;
  onSave: () => void;
};

const HOLD_DURATION_MS = 2000;
const STAGED_ARC_COLOR = '#8b5cf6';
const ARC_SWEEP = 160;
const TOP_START_ANGLE = 190;
const BOTTOM_START_ANGLE = 10;
const TOUCH_PADDING = 12;
const HOLD_RING_RADIUS_SCALE = 0.92;

const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
const isAngleWithinArc = (angle: number, startAngle: number, sweepAngle: number) => {
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(startAngle + sweepAngle);
  const target = normalizeAngle(angle);
  if (start <= end) {
    return target >= start && target <= end;
  }
  return target >= start || target <= end;
};

const isPointOnArc = (
  x: number,
  y: number,
  center: number,
  radius: number,
  strokeWidth: number,
  startAngle: number,
  sweepAngle: number
) => {
  const dx = x - center;
  const dy = y - center;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const tolerance = Math.max(12, strokeWidth * 1.1) + TOUCH_PADDING;
  const withinRadius = distance >= radius - tolerance && distance <= radius + tolerance;
  if (!withinRadius) return false;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return isAngleWithinArc(angle, startAngle, sweepAngle);
};

export const ControlPad = ({
  connected,
  power,
  powerKnown = true,
  pendingPower,
  intensity,
  powerCeilingWatts,
  hue,
  saveState,
  onPowerToggle,
  onIntensityChange,
  onSave,
}: ControlPadProps) => {
  const theme = useAppTheme();
  const colors = theme.colors;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    centerDiameter,
    arcDiameter,
    arcStroke,
    progressStroke,
    thumbRadius,
  } = useControlSizing();

  const arcRadiusBase = arcDiameter / 2 - arcStroke / 2;

  const progress = useSharedValue(0);
  const [holding, setHolding] = useState(false);
  const holdCompletedRef = useRef(false);


  // Place the hold loader midway between the center control and the inner
  // edge of the two arc sliders. Account for its own stroke so the visible
  // gaps—not just the path centerlines—remain balanced.
  const centerOuterRadius = centerDiameter / 2;
  const arcInnerRadius = arcRadiusBase - arcStroke / 2;
  const ringRadius = ((centerOuterRadius + arcInnerRadius) / 2) * HOLD_RING_RADIUS_SCALE;
  const ringDiameter = Math.ceil((ringRadius + progressStroke / 2) * 2);

  const hasPendingArcValues = saveState === 'dirty';
  const canHoldCenter = connected && !pendingPower && saveState !== 'saving';

  const centerState = useMemo(() => {
    if (!powerKnown) return { color: colors.arcTrack, label: '--' };
    /* Purple means only one thing: an arc value is staged locally and needs
     * an intentional hold to apply.  It never changes the on/off meaning. */
    if (hasPendingArcValues) {
      return { color: STAGED_ARC_COLOR, label: `${intensity.toFixed(1)} W` };
    }
    if (saveState === 'saving') {
      return { color: STAGED_ARC_COLOR, label: '' };
    }
    return { color: power ? colors.powerOn : colors.powerOff, label: '' };
  }, [colors, hasPendingArcValues, power, powerKnown, saveState]);

  const resetHold = () => {
    cancelAnimation(progress);
    progress.value = 0;
    setHolding(false);
  };

  const startHold = () => {
    if (!canHoldCenter) return;
    holdCompletedRef.current = false;
    setHolding(true);
    progress.value = 0;
    progress.value = withTiming(
      1,
      { duration: HOLD_DURATION_MS, easing: Easing.linear },
      (finished) => {
        if (finished && !holdCompletedRef.current) {
          holdCompletedRef.current = true;
          runOnJS(setHolding)(false);
          progress.value = 0;
          runOnJS(Vibration.vibrate)(15);
          if (hasPendingArcValues) {
            runOnJS(onSave)();
          } else {
            runOnJS(onPowerToggle)(!power);
          }
        }
      }
    );
  };

  const endHold = () => {
    if (!canHoldCenter) return;
    if (holdCompletedRef.current) {
      holdCompletedRef.current = false;
      return;
    }
    resetHold();
  };

  const ringColor = hasPendingArcValues ? STAGED_ARC_COLOR : (power ? colors.powerOff : colors.ring);
  const ringColorSk = useMemo(() => Skia.Color(ringColor), [ringColor]);
  const ringTrackSk = useMemo(() => Skia.Color(colors.ringTrack), [colors.ringTrack]);
  const ringTrackPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(progressStroke);
    paint.setStrokeCap(1);
    paint.setColor(ringTrackSk);
    return paint;
  }, [progressStroke, ringTrackSk]);
  const ringProgressPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(progressStroke);
    paint.setStrokeCap(1);
    paint.setColor(ringColorSk);
    return paint;
  }, [progressStroke, ringColorSk]);
  const ringPath = useMemo(() => {
    return Skia.Path.Circle(ringDiameter / 2, ringDiameter / 2, ringRadius);
  }, [ringDiameter, ringRadius]);

  const activeArcRef = useRef<'top' | 'bottom' | null>(null);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          if (!connected) return false;
          const { locationX, locationY } = event.nativeEvent;
          if (isPointOnArc(locationX, locationY, arcDiameter / 2, arcRadiusBase, arcStroke, TOP_START_ANGLE, ARC_SWEEP)) {
            activeArcRef.current = 'top';
            return true;
          }
          // The lower arc is deliberately telemetry/readout only. Manual
          // output owns phase ratios, so allowing a colour gesture here would
          // silently invent or rebalance channels behind the user's back.
          activeArcRef.current = null;
          return false;
        },
        onMoveShouldSetPanResponder: () => false,
        onPanResponderGrant: (event) => {
          if (!connected) return;
          const { locationX, locationY } = event.nativeEvent;
          const angle = (Math.atan2(locationY - arcDiameter / 2, locationX - arcDiameter / 2) * 180) / Math.PI;
          if (activeArcRef.current === 'top') {
            const offset = normalizeAngle(angle - TOP_START_ANGLE);
            const clamped = Math.min(Math.max(offset, 0), ARC_SWEEP);
            onIntensityChange((clamped / ARC_SWEEP) * powerCeilingWatts);
          }
        },
        onPanResponderMove: (event) => {
          if (!connected) return;
          const { locationX, locationY } = event.nativeEvent;
          const angle = (Math.atan2(locationY - arcDiameter / 2, locationX - arcDiameter / 2) * 180) / Math.PI;
          if (activeArcRef.current === 'top') {
            const offset = normalizeAngle(angle - TOP_START_ANGLE);
            const clamped = Math.min(Math.max(offset, 0), ARC_SWEEP);
            onIntensityChange((clamped / ARC_SWEEP) * powerCeilingWatts);
          }
        },
        onPanResponderRelease: () => {
          activeArcRef.current = null;
        },
        onPanResponderTerminate: () => {
          activeArcRef.current = null;
        },
      }),
    [connected, arcDiameter, arcRadiusBase, arcStroke, onIntensityChange, powerCeilingWatts]
  );

  return (
    <View style={styles.container}>
      <View
        style={[styles.arcStack, { width: arcDiameter, height: arcDiameter }]}
        {...panResponder.panHandlers}
      >
        <ArcSlider
          size={arcDiameter}
          strokeWidth={arcStroke}
          thumbRadius={thumbRadius}
          value={intensity}
          min={0}
          max={Math.max(1, powerCeilingWatts)}
          startAngle={TOP_START_ANGLE}
          sweepAngle={ARC_SWEEP}
          gradientStops={[
            { offset: '0%', color: '#66706a' },
            { offset: '55%', color: '#b8c0bb' },
            { offset: '100%', color: '#f5f7f5' },
          ]}
          trackColor="#e2e7e3"
          thumbColor="#ffffff"
          interactive={false}
        />
        <ArcSlider
          size={arcDiameter}
          strokeWidth={arcStroke}
          thumbRadius={thumbRadius}
          value={hue}
          min={0}
          max={1}
          startAngle={BOTTOM_START_ANGLE}
          sweepAngle={ARC_SWEEP}
          gradientStops={[
            { offset: '0%', color: '#2684ff' },
            { offset: '35%', color: '#d8edff' },
            { offset: '50%', color: '#fffdf5' },
            { offset: '72%', color: '#ffbe6b' },
            { offset: '100%', color: '#ee3e45' },
          ]}
          trackColor={colors.arcTrack}
          thumbColor="#ffffff"
          interactive={false}
        />
        <View style={[styles.centerWrap, { width: centerDiameter, height: centerDiameter }]}> 
          <Pressable
            onPressIn={startHold}
            onPressOut={endHold}
            disabled={!canHoldCenter}
            style={[
              styles.centerButton,
              {
                backgroundColor: centerState.color,
                width: centerDiameter,
                height: centerDiameter,
                borderRadius: centerDiameter / 2,
              },
            ]}
          >
            {centerState.label ? (
              <Text style={styles.centerLabel}>{centerState.label}</Text>
            ) : null}
          </Pressable>

          {holding && canHoldCenter ? (
            <View
              style={[
                styles.progressRing,
                {
                  width: ringDiameter,
                  height: ringDiameter,
                  borderRadius: ringDiameter / 2,
                },
              ]}
              pointerEvents="none"
            >
              <Canvas style={{ width: ringDiameter, height: ringDiameter }}>
                <Path
                  path={ringPath}
                  start={0}
                  end={1}
                  paint={ringTrackPaint}
                />
                <Path
                  path={ringPath}
                  start={0}
                  end={progress}
                  paint={ringProgressPaint}
                />
              </Canvas>
            </View>
          ) : null}
        </View>

        {!connected ? <View style={styles.disabledOverlay} /> : null}
      </View>

    </View>
  );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: SPACING.md,
  },
  arcStack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    color: theme.colors.textPrimary,
    fontSize: TYPOGRAPHY.sizes.body,
    fontWeight: TYPOGRAPHY.weights.bold,
    letterSpacing: 0.5,
  },
  progressRing: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.mode === 'light' ? 'rgba(39, 51, 43, 0.12)' : 'rgba(15, 23, 42, 0.4)',
    borderRadius: 999,
  },
});
