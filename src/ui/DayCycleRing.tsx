import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import type { SkColor } from '@shopify/react-native-skia';
import { useAppTheme } from './theme';
import type { AppTheme } from './theme';
import { anglesForSegment, minutesToAngle, splitMinutesRange, sweepForAngles, TimeFormat } from './timeUtils';

type DayCycle = {
  sunrise: number;
  sunset: number;
};

type DayCycleRingProps = {
  size: number;
  strokeWidth: number;
  dayCycle: DayCycle;
  nowMinutes: number;
  timeFormat: TimeFormat;
  hasLocation?: boolean;
};

const makeRect = (x: number, y: number, w: number, h: number) =>
  (Skia as any).XYWHRect ? (Skia as any).XYWHRect(x, y, w, h) : { x, y, width: w, height: h };

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

export const DayCycleRing = ({ size, strokeWidth, dayCycle, nowMinutes, timeFormat, hasLocation = true }: DayCycleRingProps) => {
  const theme = useAppTheme();
  const colors = theme.colors;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const center = size / 2;
  const ringStroke = strokeWidth * 2;
  const radius = size / 2 - ringStroke / 2;

  const nightColor = useMemo(() => Skia.Color(colors.surfaceAlt), [colors.surfaceAlt]);
  const sunriseYellow = useMemo(() => Skia.Color('#f7dd75'), []);
  const skyBlue = useMemo(() => Skia.Color('#1182b2'), []);
  const sunsetRed = useMemo(() => Skia.Color('#c30f0f'), []);
  const transparentSky = useMemo(() => Skia.Color('rgba(56, 189, 248, 0)'), []);
  const markerColor = useMemo(() => Skia.Color('#1f5d3a'), []);

  const ringPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(ringStroke);
    paint.setStrokeCap(1);
    paint.setColor(nightColor);
    return paint;
  }, [ringStroke, nightColor]);

  const ringPath = useMemo(() => {
    return Skia.Path.Circle(center, center, radius);
  }, [center, radius]);

  const getRangeSegments = (start: number, end: number) => {
    const duration = (end - start + 1440) % 1440;
    if (duration <= 0) return [] as { start: number; end: number }[];
    return splitMinutesRange(start, end);
  };

  const sunriseFade = 60;
  const sunsetFade = 60;

  const sunriseStart = dayCycle.sunrise;
  const sunriseEnd = Math.min(dayCycle.sunrise + sunriseFade, dayCycle.sunset);
  const sunsetStart = Math.max(dayCycle.sunset - sunsetFade, dayCycle.sunrise);
  const sunsetEnd = dayCycle.sunset;

  const dayCoreSegments = useMemo(
    () => (hasLocation && sunriseEnd < sunsetStart ? getRangeSegments(sunriseEnd, sunsetStart) : []),
    [hasLocation, sunriseEnd, sunsetStart]
  );
  const sunriseSegments = useMemo(
    () => (hasLocation ? getRangeSegments(sunriseStart, sunriseEnd) : []),
    [hasLocation, sunriseStart, sunriseEnd]
  );
  const sunsetSegments = useMemo(
    () => (hasLocation ? getRangeSegments(sunsetStart, sunsetEnd) : []),
    [hasLocation, sunsetStart, sunsetEnd]
  );

  const buildPaths = (segments: { start: number; end: number }[]) =>
    segments.map((segment) => {
      const { startAngle, endAngle } = anglesForSegment(segment, timeFormat);
      const sweep = sweepForAngles(startAngle, endAngle);
      const path = Skia.PathBuilder.Make()
        .addArc(makeRect(center - radius, center - radius, radius * 2, radius * 2), startAngle, sweep)
        .build();
      return { segment, path, startAngle, endAngle };
    });

  const dayCorePaths = useMemo(() => buildPaths(dayCoreSegments), [dayCoreSegments, center, radius, timeFormat]);
  const sunrisePaths = useMemo(() => buildPaths(sunriseSegments), [sunriseSegments, center, radius, timeFormat]);
  const sunsetPaths = useMemo(() => buildPaths(sunsetSegments), [sunsetSegments, center, radius, timeFormat]);

  const makeGradientPaint = (startAngle: number, endAngle: number, colors: SkColor[]) => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(ringStroke);
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

  const dayCorePaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(ringStroke);
    paint.setStrokeCap(1);
    paint.setColor(skyBlue);
    return paint;
  }, [ringStroke, skyBlue]);

  const sunrisePaints = useMemo(
    () => sunrisePaths.map((entry) => makeGradientPaint(entry.startAngle, entry.endAngle, [transparentSky, sunriseYellow, skyBlue])),
    [sunrisePaths, transparentSky, sunriseYellow, skyBlue, center, radius, ringStroke]
  );
  const sunsetPaints = useMemo(
    () => sunsetPaths.map((entry) => makeGradientPaint(entry.startAngle, entry.endAngle, [skyBlue, sunsetRed, transparentSky])),
    [sunsetPaths, skyBlue, sunsetRed, transparentSky, center, radius, ringStroke]
  );

  const sunRiseStyle = useMemo(() => StyleSheet.flatten(styles.sunRiseDot), [styles]);
  const sunSetStyle = useMemo(() => StyleSheet.flatten(styles.sunSetDot), [styles]);
  const sunDotSize = useMemo(() => {
    const size = Math.max(Number(sunRiseStyle.width) || 6, Number(sunRiseStyle.height) || 6);
    return size;
  }, [sunRiseStyle]);
  const sunDotRadius = radius;
  const sunRiseAngle = minutesToAngle(sunriseStart + sunriseFade / 2, timeFormat) + 0.0;
  const sunSetAngle = minutesToAngle(sunsetStart + sunsetFade / 2, timeFormat) + 0.0;
  const sunRiseRad = (sunRiseAngle * Math.PI) / 180;
  const sunSetRad = (sunSetAngle * Math.PI) / 180;
  const sunRiseX = center + sunDotRadius * Math.cos(sunRiseRad);
  const sunRiseY = center + sunDotRadius * Math.sin(sunRiseRad);
  const sunSetX = center + sunDotRadius * Math.cos(sunSetRad);
  const sunSetY = center + sunDotRadius * Math.sin(sunSetRad);

  const tickPaint = useMemo(() => {
    const paint = Skia.Paint();
    paint.setStyle(1);
    paint.setStrokeWidth(Math.max(1, ringStroke * 0.08));
    paint.setStrokeCap(1);
    paint.setColor(Skia.Color(colors.textSecondary));
    return paint;
  }, [colors.textSecondary, ringStroke]);

  const hourTicks = useMemo(() => {
    const ticks = [] as { x1: number; y1: number; x2: number; y2: number; hour: number }[];
    const outer = radius - ringStroke * 0.1;
    const major = ringStroke * 0.55;
    const minor = ringStroke * 0.35;
    for (let hour = 0; hour < 24; hour += 1) {
      const angle = minutesToAngle(hour * 60, timeFormat);
      const rad = (angle * Math.PI) / 180;
      const length = hour % 6 === 0 ? major : minor;
      const x1 = center + (outer - length) * Math.cos(rad);
      const y1 = center + (outer - length) * Math.sin(rad);
      const x2 = center + outer * Math.cos(rad);
      const y2 = center + outer * Math.sin(rad);
      ticks.push({ x1, y1, x2, y2, hour });
    }
    return ticks;
  }, [center, radius, ringStroke, timeFormat]);

  const hourLabels = useMemo(() => {
    const labels = [] as { x: number; y: number; text: string; hour: number }[];
    const labelRadius = radius - ringStroke * 1.1;
    for (let hour = 0; hour < 24; hour += 1) {
      const angle = minutesToAngle(hour * 60, timeFormat);
      const rad = (angle * Math.PI) / 180;
      const x = center + labelRadius * Math.cos(rad);
      const y = center + labelRadius * Math.sin(rad);
      const label = timeFormat === '24' ? String(hour).padStart(2, '0') : String((hour % 12) || 12);
      labels.push({ x, y, text: label, hour });
    }
    return labels;
  }, [center, radius, ringStroke, timeFormat]);

  const markerAngle = minutesToAngle(nowMinutes, timeFormat);
  const markerRad = (markerAngle * Math.PI) / 180;
  const markerRadius = radius - ringStroke * 0.8;
  const markerX = center + markerRadius * Math.cos(markerRad);
  const markerY = center + markerRadius * Math.sin(markerRad);

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
        <Path path={ringPath} start={0} end={1} paint={ringPaint} />
        {dayCorePaths.map((entry, index) => (
          <Path key={`day-${index}`} path={entry.path} start={0} end={1} paint={dayCorePaint} />
        ))}
        {sunrisePaths.map((entry, index) => (
          <Path key={`sunrise-${index}`} path={entry.path} start={0} end={1} paint={sunrisePaints[index]} />
        ))}
        {sunsetPaths.map((entry, index) => (
          <Path key={`sunset-${index}`} path={entry.path} start={0} end={1} paint={sunsetPaints[index]} />
        ))}
        {hourTicks.map((tick) => {
          const path = Skia.PathBuilder.Make()
            .moveTo(tick.x1, tick.y1)
            .lineTo(tick.x2, tick.y2)
            .build();
          return <Path key={`tick-${tick.hour}`} path={path} paint={tickPaint} />;
        })}
        <Circle cx={markerX} cy={markerY} r={ringStroke * 0.16} color={markerColor} />
      </Canvas>
      {hasLocation ? (
        <View
          style={[
            styles.sunRiseDot,
            {
              left: sunRiseX - sunDotSize / 2,
              top: sunRiseY - sunDotSize / 2,
            },
          ]}
        />
      ) : null}
      {hasLocation ? (
        <View
          style={[
            styles.sunSetDot,
            {
              left: sunSetX - sunDotSize / 2,
              top: sunSetY - sunDotSize / 2,
            },
          ]}
        />
      ) : null}
      {hourLabels.map((label) => (
        <View
          key={`label-${label.hour}`}
          style={[
            styles.hourLabel,
            {
              left: label.x,
              top: label.y,
              transform: [{ translateX: -8 }, { translateY: -6 }],
            },
          ]}
        >
          <Text style={styles.hourLabelText}>{label.text}</Text>
        </View>
      ))}
    </View>
  );
};

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hourLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourLabelText: {
    color: theme.colors.textSecondary,
    fontSize: 9,
  },
  sunRiseDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#fde68a',
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  sunSetDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#b91c1c',
  },
});
