/**
 * coords: [lat, lon]
 * zoom: ズームレベル
 * size: 'WIDTHxHEIGHT' 形式（例: '600x400'）
 *
 * ここでは openstreetmap の静的マップサービス(staticmap.openstreetmap.de)を利用
 */
export function generateStaticMap(coords: [number, number], zoom = 12, size = '600x400') {
  const [lat, lon] = coords;
  const base = 'https://staticmap.openstreetmap.de/staticmap.php';
  const markers = `${lat},${lon},red-pushpin`;
  // 例: https://staticmap.openstreetmap.de/staticmap.php?center=lat,lon&zoom=12&size=600x400&markers=lat,lon,red-pushpin
  return `${base}?center=${lat},${lon}&zoom=${zoom}&size=${size}&markers=${markers}`;
}
