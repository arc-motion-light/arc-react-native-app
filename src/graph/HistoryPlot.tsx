import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type HistoryPlotPoint<Key extends string = string> = {
  id: string; signalKey: Key; xPx: number; yPx: number; value: number;
  timeLabel: string; sequence?: number;
};
export type HistoryPlotSeries<Key extends string = string> = {
  signalKey: Key; meta: { label: string; color: string; unit: string };
  points: HistoryPlotPoint<Key>[]; path: string;
};
function HistoryPlotImpl<Key extends string>({ width, height, series, onSelect, pointStyle, dotStyle, maxInteractivePoints = Infinity }: {
  width: number; height: number; series: readonly HistoryPlotSeries<Key>[];
  onSelect: (series: HistoryPlotSeries<Key>, point: HistoryPlotPoint<Key>) => void;
  pointStyle?: StyleProp<ViewStyle>; dotStyle?: StyleProp<ViewStyle>; maxInteractivePoints?: number;
}) {
  return <>
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      {series.map(item => item.path ? <Path key={`path-${item.signalKey}`} d={item.path} fill="none"
        stroke={item.meta.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /> : null)}
    </Svg>
    {series.map(item => <View key={`series-${item.signalKey}`} pointerEvents="box-none">
      {item.points.filter((_point, index) => index === 0 || index === item.points.length - 1 ||
        index % Math.max(1, Math.ceil(item.points.length / maxInteractivePoints)) === 0).map(point => <TouchableOpacity key={point.id}
        accessibilityLabel={`${item.meta.label}, ${point.value} ${item.meta.unit}${point.sequence === undefined ? '' : `, sequence ${point.sequence}`}`}
        style={[styles.point, pointStyle, { left: point.xPx, top: point.yPx, transform: [{ translateX: -9 }, { translateY: -9 }] }]}
        onPress={() => onSelect(item, point)}>
        <View style={[styles.dot, dotStyle, { backgroundColor: item.meta.color }]} />
      </TouchableOpacity>)}
    </View>)}
  </>;
}
export const HistoryPlot = React.memo(HistoryPlotImpl) as typeof HistoryPlotImpl;
const styles = StyleSheet.create({
  point: { position: 'absolute', width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
