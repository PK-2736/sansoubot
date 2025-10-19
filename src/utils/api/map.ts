/**
 * coords: [lat, lon]
 * zoom: ズームレベル
 * size: 'WIDTHxHEIGHT' 形式（例: '600x400'）
 *
 * ここでは OpenStreetMap の静的マップサービス（staticmap.openstreetmap.de）を利用します。
 */
/**
 * generateStaticMap（静的マップ URL 生成）
 * - center: 中心座標 [lat, lon]
 * - markers: マーカー配列（{ lat, lon, color(任意), icon(任意) }）
 * - path: ポリライン描画用の座標配列（[lat, lon] の配列、任意）
 */
export function generateStaticMap(
  center: [number, number],
  zoom = 12,
  size = '600x400',
  markers: Array<{ lat: number; lon: number; color?: string; icon?: string }> = [],
  path?: Array<[number, number]>,
  pathOptions?: { color?: string; weight?: number }
) {
  const [lat, lon] = center;
  const base = 'https://staticmap.openstreetmap.de/staticmap.php';

  // マーカーのフォーマット: lat,lon,icon|lat2,lon2,icon2
  const markerParts = markers.map(m => {
    const icon = m.icon ? m.icon : 'red-pushpin';
    return `${m.lat},${m.lon},${icon}`;
  });
  const markersParam = markerParts.length ? `&markers=${markerParts.join('|')}` : '';

  // パスのフォーマット: path=weight:3|color:0xff0000|lat,lon|lat2,lon2
  let pathParam = '';
  if (path && path.length > 0) {
    const pts = path.map(p => `${p[0]},${p[1]}`).join('|');
    // default weight/color
    const weight = pathOptions?.weight ?? 3;
    // expect hex like #rrggbb or rrggbb -> convert to 0xrrggbb
    let color = pathOptions?.color ?? '#ff0000';
    color = color.replace('#', '');
    pathParam = `&path=weight:${weight}|color:0x${color}|${pts}`;
  }

  return `${base}?center=${lat},${lon}&zoom=${zoom}&size=${size}${markersParam}${pathParam}`;
}
