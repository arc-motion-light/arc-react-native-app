const MINUTES_IN_DAY = 1440;

export type TimeFormat = '24' | 'ampm';

type Segment = {
  start: number;
  end: number;
};

const normalizeAngle = (angle: number) => ((angle % 360) + 360) % 360;

export const minutesToAngle = (minutes: number, format: TimeFormat): number => {
  const clamped = ((minutes % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  if (format === 'ampm') {
    const half = clamped % 720;
    const base = (half / 720) * 180;
    return (clamped < 720 ? base - 90 : base + 90) - 180;
  }
  return (clamped / MINUTES_IN_DAY) * 360 - 270;
};

export const splitMinutesRange = (start: number, end: number): Segment[] => {
  const safeStart = ((start % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  const safeEnd = ((end % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  if (safeStart === safeEnd) {
    return [{ start: 0, end: MINUTES_IN_DAY }];
  }
  if (end >= start) {
    return [{ start: safeStart, end: safeEnd }];
  }
  return [
    { start: safeStart, end: MINUTES_IN_DAY },
    { start: 0, end: safeEnd },
  ];
};

export const anglesForSegment = (segment: Segment, format: TimeFormat) => {
  const startAngle = normalizeAngle(minutesToAngle(segment.start, format));
  const endAngle = normalizeAngle(minutesToAngle(segment.end, format));
  return { startAngle, endAngle };
};

export const sweepForAngles = (startAngle: number, endAngle: number) => {
  const sweep = ((endAngle - startAngle) % 360 + 360) % 360;
  return sweep === 0 ? 360 : sweep;
};
