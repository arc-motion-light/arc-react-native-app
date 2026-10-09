export type GraphVectorPoint = {
  xPx: number;
  yPx: number;
};

export const buildMonotoneSvgPath = (points: GraphVectorPoint[]): string => {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].xPx} ${points[0].yPx}`;

  const linearPath = () =>
    points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.xPx} ${point.yPx}`)
      .join(' ');

  if (points.length === 2) return linearPath();

  const intervalWidths: number[] = [];
  const secants: number[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const dx = points[index + 1].xPx - points[index].xPx;
    if (!Number.isFinite(dx) || dx <= 0) return linearPath();
    intervalWidths.push(dx);
    secants.push((points[index + 1].yPx - points[index].yPx) / dx);
  }

  const tangents = new Array<number>(points.length).fill(0);

  const endpointSlope = (
    h0: number,
    h1: number,
    delta0: number,
    delta1: number
  ) => {
    let slope = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1);
    if (Math.sign(slope) !== Math.sign(delta0)) {
      slope = 0;
    } else if (
      Math.sign(delta0) !== Math.sign(delta1) &&
      Math.abs(slope) > Math.abs(3 * delta0)
    ) {
      slope = 3 * delta0;
    }
    return slope;
  };

  tangents[0] = endpointSlope(
    intervalWidths[0],
    intervalWidths[1],
    secants[0],
    secants[1]
  );
  tangents[points.length - 1] = endpointSlope(
    intervalWidths[intervalWidths.length - 1],
    intervalWidths[intervalWidths.length - 2],
    secants[secants.length - 1],
    secants[secants.length - 2]
  );

  for (let index = 1; index < points.length - 1; index += 1) {
    const previousSlope = secants[index - 1];
    const nextSlope = secants[index];

    if (
      previousSlope === 0 ||
      nextSlope === 0 ||
      Math.sign(previousSlope) !== Math.sign(nextSlope)
    ) {
      tangents[index] = 0;
      continue;
    }

    const previousWidth = intervalWidths[index - 1];
    const nextWidth = intervalWidths[index];
    const weight1 = 2 * nextWidth + previousWidth;
    const weight2 = nextWidth + 2 * previousWidth;
    tangents[index] =
      (weight1 + weight2) /
      (weight1 / previousSlope + weight2 / nextSlope);
  }

  let path = `M ${points[0].xPx} ${points[0].yPx}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const width = intervalWidths[index];

    const control1X = current.xPx + width / 3;
    const control1Y = current.yPx + (tangents[index] * width) / 3;
    const control2X = next.xPx - width / 3;
    const control2Y = next.yPx - (tangents[index + 1] * width) / 3;

    path += ` C ${control1X} ${control1Y} ${control2X} ${control2Y} ${next.xPx} ${next.yPx}`;
  }

  return path;
};

