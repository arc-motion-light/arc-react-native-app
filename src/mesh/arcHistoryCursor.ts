import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeSequenceRanges, type HistorySequenceRange } from './arcHistorySession';

const generations=new Map<string,string>();
export const setArcHistoryGeneration=(lampId:string,generation:string)=>{
  if(!/^[0-9A-F]{16}$/.test(generation) || /^0{16}$/.test(generation))throw new Error('Invalid journal generation');
  generations.set(lampId,generation);
};
const keyForLamp = (lampId: string, userId?: string) => `arc:lamp-history:${generations.has(lampId)?`v4:${generations.get(lampId)}`:'v1'}:${encodeURIComponent(lampId)}${userId ? `:user:${encodeURIComponent(userId)}` : ''}`;
const rangesKey = (lampId: string, userId?: string) => `${keyForLamp(lampId, userId)}:durable-ranges:v3`;
let writes: Promise<void> = Promise.resolve();
export const loadArcHistoryCursor = async (lampId: string, userId?: string): Promise<number> => {
  const value = await AsyncStorage.getItem(keyForLamp(lampId, userId));
  const parsed = value === null ? -1 : Number(value);
  return Number.isInteger(parsed) && parsed >= -1 && parsed <= 0xffffffff ? parsed : -1;
};
export const loadArcHistoryDurability = async (lampId: string, userId?: string) => {
  const cursor = await loadArcHistoryCursor(lampId, userId);
  let ranges: HistorySequenceRange[] = [];
  try {
    const parsed = JSON.parse(await AsyncStorage.getItem(rangesKey(lampId, userId)) ?? '[]');
    if (Array.isArray(parsed)) ranges = mergeSequenceRanges(parsed.filter(r => r && typeof r === 'object'));
  } catch { /* Missing/corrupt sparse metadata causes conservative recovery. */ }
  return { cursor, ranges };
};
/** Call only after a durable append. Cloud coverage must never call this. */
export const saveArcHistoryCursor = async (lampId: string, sequence: number, userId?: string, framOldest = 0): Promise<void> => {
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 0xffffffff) throw new Error('Invalid durable history sequence');
  const operation = writes.catch(() => undefined).then(async () => {
    const local = await loadArcHistoryDurability(lampId, userId);
    const ranges = mergeSequenceRanges([...local.ranges, { from: sequence, through: sequence }]);
    // Natural FRAM overwrite may remove an unrecoverable prefix. A Cloud skip
    // cannot: store sparse local ranges until the real local gap is recovered.
    let through = Math.max(local.cursor, framOldest-1);
    for (const range of ranges) {
      if (range.from > through+1) break;
      through = Math.max(through, range.through);
    }
    const cursor = through > Math.max(local.cursor, framOldest-1) ? through : local.cursor;
    await AsyncStorage.setItem(rangesKey(lampId, userId), JSON.stringify(ranges.filter(r => r.through > cursor)));
    await AsyncStorage.setItem(keyForLamp(lampId, userId), String(cursor));
  });
  writes = operation;
  await operation;
};
