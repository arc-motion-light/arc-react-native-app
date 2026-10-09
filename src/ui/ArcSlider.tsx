import React, { useMemo } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  Path,
  Skia,
} from '@shopify/react-native-skia';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;
const circularDistance = (a: number, b: number) => {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
};

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = Math.abs(endAngle - startAngle);
  const largeArcFlag = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

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
  const tolerance = Math.max(12, strokeWidth * 1.1);
  const withinRadius = distance >= radius - tolerance && distance <= radius + tolerance;
  if (!withinRadius) return false;

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return isAngleWithinArc(angle, startAngle, sweepAngle);
};

const angleToOffset = (angle: number, startAngle: number, sweepAngle: number) => {
  const start = normalizeAngle(startAngle);
  const end = normalizeAngle(startAngle + sweepAngle);
  const target = normalizeAngle(angle);

  let within = false;
  let offset = 0;

  if (start <= end) {
    if (target >= start && target <= end) {
      within = true;
      offset = target - start;
    }
  } else {
    if (target >= start || target <= end) {
      within = true;
      offset = target >= start ? target - start : 360 - start + target;
    }
  }

  if (!within) {
    const distStart = circularDistance(target, start);
    const distEnd = circularDistance(target, end);
    offset = distStart <= distEnd ? 0 : sweepAngle;
  }

  return clamp(offset, 0, sweepAngle);
};

type GradientStop = {
  offset: string;
  color: string;
};

type ArcSliderProps = {
  size: number;
  strokeWidth: number;
  thumbRadius?: number;
  radiusOffset?: number;
  value: number;
  min: number;
  max: number;
  startAngle: number;
  sweepAngle: number;
  gradientStops: GradientStop[];
  trackColor: string;
  thumbColor: string;
  disabled?: boolean;
  onValueChange?: (value: number) => void;
  interactive?: boolean;
};

export const ArcSlider = ({
  size,
  strokeWidth,
  thumbRadius,
  radiusOffset = 0,
  value,
  min,
  max,
  startAngle,
  sweepAngle,
  gradientStops,
  trackColor,
  thumbColor,
  disabled,
  onValueChange,
  interactive = true,
}: ArcSliderProps) => {
  const effectiveThumbRadius = thumbRadius ?? strokeWidth * 0.55;
  const radius = size / 2 - strokeWidth / 2 - effectiveThumbRadius + radiusOffset;
  const center = size / 2;

  const progress = clamp((value - min) / (max - min), 0, 1);
  const endAngle = startAngle + sweepAngle * progress;

  const backgroundPath = useMemo(() => {
    const raw = describeArc(center, center, radius, startAngle, startAngle + sweepAngle);
    return Skia.Path.MakeFromSVGString(raw);
  }, [center, radius, startAngle, sweepAngle]);
  const progressPath = useMemo(() => {
    const raw = describeArc(center, center, radius, startAngle, startAngle + sweepAngle);
    return Skia.Path.MakeFromSVGString(raw);
  }, [center, radius, startAngle, sweepAngle]);

  const gradientColors = useMemo(
    () => gradientStops.map((stop) => Skia.Color(stop.color)),
    [gradientStops]
  );
  const gradientPositions = useMemo(
    () => gradientStops.map((stop) => Number.parseFloat(stop.offset) / 100),
    [gradientStops]
  );
  const gradientShader = useMemo(
    () =>
      Skia.Shader.MakeLinearGradient(
        { x: 0, y: center },
        { x: size, y: center },
        gradientColors,
        gradientPositions,
        (Skia as any).TileMode?.Clamp
      ),
    [center, size, gradientColors, gradientPositions]
  );
  const gradientPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(strokeWidth);
    paint.setStrokeCap(1);
    if (gradientShader) paint.setShader(gradientShader);
    return paint;
  }, [gradientShader, strokeWidth]);

  const trackColorSk = useMemo(() => Skia.Color(trackColor), [trackColor]);
  const thumbColorSk = useMemo(() => Skia.Color(thumbColor), [thumbColor]);
  const trackPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(strokeWidth);
    paint.setStrokeCap(1);
    paint.setColor(trackColorSk);
    return paint;
  }, [strokeWidth, trackColorSk]);

  const thumbPoint = polarToCartesian(center, center, radius, endAngle);

  const panResponder = useMemo(() => {
    if (!interactive || !onValueChange) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: (event) => {
        if (disabled) return false;
        const { locationX, locationY } = event.nativeEvent;
        return isPointOnArc(locationX, locationY, center, radius, strokeWidth, startAngle, sweepAngle);
      },
      onMoveShouldSetPanResponder: () => false,
      onPanResponderGrant: (event) => {
        if (disabled) return;
        const { locationX, locationY } = event.nativeEvent;
        const angle = (Math.atan2(locationY - center, locationX - center) * 180) / Math.PI;
        const offset = angleToOffset(angle, startAngle, sweepAngle);
        const nextValue = min + (offset / sweepAngle) * (max - min);
        onValueChange(Math.round(nextValue));
      },
      onPanResponderMove: (event) => {
        if (disabled) return;
        const { locationX, locationY } = event.nativeEvent;
        const angle = (Math.atan2(locationY - center, locationX - center) * 180) / Math.PI;
        const offset = angleToOffset(angle, startAngle, sweepAngle);
        const nextValue = min + (offset / sweepAngle) * (max - min);
        onValueChange(Math.round(nextValue));
      },
    });
  }, [interactive, onValueChange, disabled, center, radius, strokeWidth, startAngle, sweepAngle, min, max]);

  return (
    <View
      style={[styles.container, { width: size, height: size }, disabled && styles.disabled]}
      pointerEvents={!interactive ? 'none' : 'auto'}
      {...(panResponder ? panResponder.panHandlers : {})}
    >
      <Canvas style={{ width: size, height: size }}>
        {backgroundPath ? (
          <Path
            path={backgroundPath}
            start={0}
            end={1}
            paint={trackPaint}
          />
        ) : null}
        {progressPath ? (
          <Path
            path={progressPath}
            start={0}
            end={progress}
            paint={gradientPaint}
          />
        ) : null}
        <Circle cx={thumbPoint.x} cy={thumbPoint.y} r={effectiveThumbRadius} color={thumbColorSk} />
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  disabled: {
    opacity: 0.5,
  },
});
