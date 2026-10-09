import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import type { SkColor } from '@shopify/react-native-skia';
import { anglesForSegment, minutesToAngle, splitMinutesRange, sweepForAngles, TimeFormat } from './timeUtils';

type LampSchedule = {
  on: number;
  off: number;
  hueFadeStart: number;
  hueFadeDuration: number;
  morningFade: number;
  nightFade: number;
};

type ScheduleRingProps = {
  size: number;
  strokeWidth: number;
  schedule: LampSchedule;
  timeFormat: TimeFormat;
};

const makeRect = (x: number, y: number, w: number, h: number) =>
  (Skia as any).XYWHRect ? (Skia as any).XYWHRect(x, y, w, h) : { x, y, width: w, height: h };

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

export const ScheduleRing = ({ size, strokeWidth, schedule, timeFormat }: ScheduleRingProps) => {
  const center = size / 2;
  const radius = size / 2 - strokeWidth / 2;

  const minutesInDay = 1440;

  const white = useMemo(() => Skia.Color('rgb(214, 233, 253)'), []);
  const orange = useMemo(() => Skia.Color('rgba(251, 146, 60, 0.7)'), []);
  const red = useMemo(() => Skia.Color('rgba(239, 68, 68, 0.7)'), []);
  const whiteHalf = useMemo(() => Skia.Color('rgba(248, 250, 252, 0.5)'), []);
  const yellowHalf = useMemo(() => Skia.Color('rgba(250, 204, 21, 0.5)'), []);
  const purple = useMemo(() => Skia.Color('rgba(76, 29, 149, 0.7)'), []);
  const purpleHalf = useMemo(() => Skia.Color('rgba(76, 29, 149, 0.5)'), []);

  const makeGradientPaint = (start: number, end: number, colors: SkColor[]) => {
    const startAngle = minutesToAngle(start, timeFormat);
    const endAngle = minutesToAngle(end, timeFormat);
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(strokeWidth);
    paint.setStrokeCap(1);
    if ((Skia as any).Shader?.MakeLinearGradient) {
      const startPoint = polarToCartesian(center, center, radius, startAngle);
      const endPoint = polarToCartesian(center, center, radius, endAngle);
      const shader = (Skia as any).Shader.MakeLinearGradient(
        startPoint,
        endPoint,
        colors,
        [0, 0.6, 1],
        (Skia as any).TileMode?.Clamp
      );
      paint.setShader(shader);
    } else {
      paint.setColor(colors[colors.length - 1]);
    }
    return paint;
  };

  const makeSolidPaint = (color: SkColor) => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(strokeWidth);
    paint.setStrokeCap(1);
    paint.setColor(color);
    return paint;
  };

  const getRangeSegments = (start: number, end: number) => {
    const duration = (end - start + minutesInDay) % minutesInDay;
    if (duration <= 0) return [] as { start: number; end: number }[];
    return splitMinutesRange(start, end);
  };

  const morningEnd = schedule.on + schedule.morningFade;
  const hueStart = schedule.hueFadeStart;
  const hueEnd = schedule.hueFadeStart + schedule.hueFadeDuration;
  const nightFadeStart = schedule.off - schedule.nightFade;

  const morningSegments = useMemo(
    () => (schedule.morningFade > 0 ? getRangeSegments(schedule.on, morningEnd) : []),
    [schedule.on, schedule.morningFade, morningEnd]
  );
  const daySegments = useMemo(
    () => getRangeSegments(morningEnd, hueStart),
    [morningEnd, hueStart]
  );
  const hueSegments = useMemo(
    () => (schedule.hueFadeDuration > 0 ? getRangeSegments(hueStart, hueEnd) : []),
    [hueStart, hueEnd, schedule.hueFadeDuration]
  );
  const eveningSegments = useMemo(
    () => getRangeSegments(hueEnd, nightFadeStart),
    [hueEnd, nightFadeStart]
  );
  const nightSegments = useMemo(
    () => (schedule.nightFade > 0 ? getRangeSegments(nightFadeStart, schedule.off) : []),
    [nightFadeStart, schedule.off, schedule.nightFade]
  );

  const buildPaths = (segments: { start: number; end: number }[]) =>
    segments.map((segment) => {
      const { startAngle, endAngle } = anglesForSegment(segment, timeFormat);
      const sweep = sweepForAngles(startAngle, endAngle);
      const path = Skia.PathBuilder.Make()
        .addArc(makeRect(center - radius, center - radius, radius * 2, radius * 2), startAngle, sweep)
        .build();
      return { segment, path };
    });

  const morningPaths = useMemo(() => buildPaths(morningSegments), [morningSegments, center, radius, timeFormat]);
  const dayPaths = useMemo(() => buildPaths(daySegments), [daySegments, center, radius, timeFormat]);
  const huePaths = useMemo(() => buildPaths(hueSegments), [hueSegments, center, radius, timeFormat]);
  const eveningPaths = useMemo(() => buildPaths(eveningSegments), [eveningSegments, center, radius, timeFormat]);
  const nightPaths = useMemo(() => buildPaths(nightSegments), [nightSegments, center, radius, timeFormat]);

  const dayPaints = useMemo(() => daySegments.map(() => makeSolidPaint(white)), [daySegments, white]);
  const eveningPaints = useMemo(() => eveningSegments.map(() => makeSolidPaint(red)), [eveningSegments, red]);

  const morningFadePaints = useMemo(
    () => morningSegments.map((segment) => makeGradientPaint(segment.start, segment.end, [yellowHalf, white, whiteHalf])),
    [morningSegments, yellowHalf, white, whiteHalf, timeFormat, center, radius]
  );
  const hueFadePaints = useMemo(
    () => hueSegments.map((segment) => makeGradientPaint(segment.start, segment.end, [white, orange, orange])),
    [hueSegments, white, orange, timeFormat, center, radius]
  );
  const nightFadePaints = useMemo(
    () => nightSegments.map((segment) => makeGradientPaint(segment.start, segment.end, [red, purple, purpleHalf])),
    [nightSegments, red, purple, purpleHalf, timeFormat, center, radius]
  );

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          top: '50%',
          left: '50%',
          transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
        },
      ]}
      pointerEvents="none"
    >
      <Canvas style={{ width: size, height: size }}>
        {dayPaths.map((entry, index) => (
          <Path key={`day-${index}`} path={entry.path} start={0} end={1} paint={dayPaints[index]} />
        ))}
        {eveningPaths.map((entry, index) => (
          <Path key={`evening-${index}`} path={entry.path} start={0} end={1} paint={eveningPaints[index]} />
        ))}
        {morningPaths.map((entry, index) => (
          <Path key={`morning-fade-${index}`} path={entry.path} start={0} end={1} paint={morningFadePaints[index]} />
        ))}
        {huePaths.map((entry, index) => (
          <Path key={`hue-fade-${index}`} path={entry.path} start={0} end={1} paint={hueFadePaints[index]} />
        ))}
        {nightPaths.map((entry, index) => (
          <Path key={`night-fade-${index}`} path={entry.path} start={0} end={1} paint={nightFadePaints[index]} />
        ))}
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
});
