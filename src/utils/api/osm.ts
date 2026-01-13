import axios from 'axios';
import { normalizeForSearch, generateSearchVariants } from '../string';

// OpenStreetMap Overpass API
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

export interface OSMMountain {
  id: string | number;
  name: string;
  nameKana?: string;
  elevation?: number;
  coords?: [number, number];
  description?: string;
  prefectures?: string[];
  source: 'OSM';
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
}

/**
 * Overpass APIを使用して山を検索
 * @param query 検索クエリ（山名）
 * @param bbox バウンディングボックス [south, west, north, east]（オプション）
 * @param limit 最大結果数
 */
export async function searchMountainsOSM(
  query: string,
  bbox?: [number, number, number, number],
  limit: number = 50
): Promise<OSMMountain[]> {
  try {
    // 検索クエリを正規化
    const normalizedQuery = normalizeForSearch(query);
    const variants = generateSearchVariants(normalizedQuery);

    // 日本全体のバウンディングボックス（デフォルト）
    const defaultBbox = [24, 123, 46, 146]; // [south, west, north, east]
    const searchBbox = bbox || defaultBbox;

    // Overpass QLクエリを構築
    // natural=peak（山頂）を検索
    const overpassQuery = `
[out:json][timeout:25];
(
  node["natural"="peak"]["name"~"${query}",i](${searchBbox.join(',')});
  node["natural"="volcano"]["name"~"${query}",i](${searchBbox.join(',')});
  way["natural"="peak"]["name"~"${query}",i](${searchBbox.join(',')});
  way["natural"="volcano"]["name"~"${query}",i](${searchBbox.join(',')});
);
out body ${limit};
>;
out skel qt;
    `.trim();

    const response = await axios.post(
      OVERPASS_API,
      overpassQuery,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 30000
      }
    );

    if (!response.data?.elements) {
      return [];
    }

    // 結果をパース
    const mountains: OSMMountain[] = response.data.elements
      .filter((el: any) => el.tags?.name)
      .map((element: any) => {
        const tags = element.tags || {};
        const lat = element.lat || element.center?.lat;
        const lon = element.lon || element.center?.lon;

        return {
          id: `osm-${element.type}-${element.id}`,
          name: tags.name || '不明',
          nameKana: tags['name:ja-Hira'] || tags['name:ja_kana'] || undefined,
          elevation: tags.ele ? parseFloat(tags.ele) : undefined,
          coords: (lat && lon) ? [lat, lon] as [number, number] : undefined,
          description: tags.description || tags.note || undefined,
          prefectures: [], // OSMから都道府県を取得するには追加のジオコーディングが必要
          source: 'OSM' as const,
          osmType: element.type as 'node' | 'way' | 'relation',
          osmId: element.id
        };
      })
      .filter((m: OSMMountain) => {
        // クエリとマッチする結果のみを返す
        const name = normalizeForSearch(m.name);
        const nameKana = normalizeForSearch(m.nameKana || '');
        const nameVariants = [...generateSearchVariants(name), ...generateSearchVariants(nameKana)];
        
        return variants.some(qv => 
          nameVariants.some(nv => nv.includes(qv) || qv.includes(nv))
        );
      });

    return mountains;
  } catch (error: any) {
    console.error('[OSM] Search error:', error.message);
    return [];
  }
}

/**
 * 座標から最寄りの山を検索
 * @param lat 緯度
 * @param lon 経度
 * @param radiusKm 検索半径（km）
 * @param limit 最大結果数
 */
export async function searchNearbyMountainsOSM(
  lat: number,
  lon: number,
  radiusKm: number = 10,
  limit: number = 20
): Promise<OSMMountain[]> {
  try {
    // 緯度経度から概算のバウンディングボックスを計算
    const degreePerKm = 1 / 111.32; // 1kmあたりの緯度の度数（概算）
    const delta = radiusKm * degreePerKm;
    
    const bbox: [number, number, number, number] = [
      lat - delta,  // south
      lon - delta,  // west
      lat + delta,  // north
      lon + delta   // east
    ];

    const overpassQuery = `
[out:json][timeout:25];
(
  node["natural"="peak"](${bbox.join(',')});
  node["natural"="volcano"](${bbox.join(',')});
  way["natural"="peak"](${bbox.join(',')});
  way["natural"="volcano"](${bbox.join(',')});
);
out body ${limit};
>;
out skel qt;
    `.trim();

    const response = await axios.post(
      OVERPASS_API,
      overpassQuery,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 30000
      }
    );

    if (!response.data?.elements) {
      return [];
    }

    const mountains: OSMMountain[] = response.data.elements
      .filter((el: any) => el.tags?.name)
      .map((element: any) => {
        const tags = element.tags || {};
        const elLat = element.lat || element.center?.lat;
        const elLon = element.lon || element.center?.lon;

        return {
          id: `osm-${element.type}-${element.id}`,
          name: tags.name || '不明',
          nameKana: tags['name:ja-Hira'] || tags['name:ja_kana'] || undefined,
          elevation: tags.ele ? parseFloat(tags.ele) : undefined,
          coords: (elLat && elLon) ? [elLat, elLon] as [number, number] : undefined,
          description: tags.description || tags.note || undefined,
          prefectures: [],
          source: 'OSM' as const,
          osmType: element.type as 'node' | 'way' | 'relation',
          osmId: element.id
        };
      });

    return mountains;
  } catch (error: any) {
    console.error('[OSM] Nearby search error:', error.message);
    return [];
  }
}

/**
 * OSMのライセンス表記を取得
 */
export function getOSMLicenseText(): string {
  return '© OpenStreetMap contributors\nData licensed under ODbL';
}

/**
 * OSMのライセンス表記付きリンクを取得
 */
export function getOSMLicenseLink(): string {
  return 'https://www.openstreetmap.org/copyright';
}

/**
 * OSM Web上で山を表示するURLを取得
 */
export function getOSMWebUrl(osmType: string, osmId: number, coords?: [number, number]): string {
  if (coords) {
    return `https://www.openstreetmap.org/?mlat=${coords[0]}&mlon=${coords[1]}#map=15/${coords[0]}/${coords[1]}`;
  }
  return `https://www.openstreetmap.org/${osmType}/${osmId}`;
}
