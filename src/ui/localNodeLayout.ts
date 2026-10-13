/** Presentation policy only. Android tablet rules never determine iOS geometry. */
export function localNodeColumns(platform: string, width: number): 1 | 2 {
  return platform === 'ios' ? 2 : width >= 600 ? 2 : 1;
}
export const iosLocalNodeGeometry = {
  tileHeight: 150,
  headerMinHeight: 58,
  actionHeight: 42,
} as const;
