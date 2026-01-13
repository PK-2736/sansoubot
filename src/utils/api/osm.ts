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
  console.log(`[OSM] ==========`);
  console.log(`[OSM] searchMountainsOSM called`);
  console.log(`[OSM] query: "${query}"`);
  console.log(`[OSM] limit: ${limit}`);
  
  try {
    // 検索クエリを正規化
    const normalizedQuery = normalizeForSearch(query);
    const variants = generateSearchVariants(normalizedQuery);
    
    console.log(`[OSM] normalizedQuery: "${normalizedQuery}"`);
    console.log(`[OSM] variants count: ${variants.length}`);

    // 日本全体のバウンディングボックス（デフォルト）
    const defaultBbox = [24, 123, 46, 146]; // [south, west, north, east]
    const searchBbox = bbox || defaultBbox;
    
    console.log(`[OSM] bbox: ${searchBbox.join(',')}`);

    // Overpass QLクエリを構築
    // 日本語のクエリに対応するため、クエリ部分は広めに取得してから後でフィルタ
    // まずは全ての山を取得する方式に変更（name存在チェックのみ）
    const overpassQuery = `
[out:json][timeout:25];
(
  node["natural"="peak"]["name"](${searchBbox.join(',')});
  node["natural"="volcano"]["name"](${searchBbox.join(',')});
  way["natural"="peak"]["name"](${searchBbox.join(',')});
  way["natural"="volcano"]["name"](${searchBbox.join(',')});
);
out body 500;
>;
out skel qt;
    `.trim();

    console.log(`[OSM] Sending request to ${OVERPASS_API}`);
    console.log(`[OSM] Query preview: ${overpassQuery.substring(0, 150)}...`);

    const response = await axios.post(
      OVERPASS_API,
      overpassQuery,
      {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 30000
      }
    );

    console.log(`[OSM] Response received`);
    console.log(`[OSM] Status: ${response.status}`);
    console.log(`[OSM] Elements count: ${response.data?.elements?.length || 0}`);

    if (!response.data?.elements) {
      console.log('[OSM] No elements in response, returning empty array');
      return [];
    }

    console.log(`[OSM] Parsing ${response.data.elements.length} elements...`);
    
    // 結果をパース
    const allParsed = response.data.elements
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
      });

    console.log(`[OSM] Parsed ${allParsed.length} mountains with names`);
    if (allParsed.length > 0) {
      console.log(`[OSM] Sample names: ${allParsed.slice(0, 5).map((m: OSMMountain) => m.name).join(', ')}`);
    }
    
    // クエリとマッチする結果のみを返す
    console.log(`[OSM] Filtering by query variants...`);
    const mountains = allParsed.filter((m: OSMMountain) => {
      const name = normalizeForSearch(m.name);
      const nameKana = normalizeForSearch(m.nameKana || '');
      const nameVariants = [...generateSearchVariants(name), ...generateSearchVariants(nameKana)];
      
      const matches = variants.some(qv => 
        nameVariants.some(nv => nv.includes(qv) || qv.includes(nv))
      );
      
      if (matches && mountains.length < 3) {
        console.log(`[OSM] MATCH: "${m.name}" matched query "${query}"`);
      }
      
      return matches;
    });

    console.log(`[OSM] After filtering: ${mountains.length} mountains`);
    if (mountains.length > 0) {
      console.log(`[OSM] First result: ${mountains[0].name} (elevation: ${mountains[0].elevation}m)`);
    }
    
    // Limit the results
    const limitedResults = mountains.slice(0, limit);
    console.log(`[OSM] Returning ${limitedResults.length} results (limited from ${mountains.length})`);
    console.log(`[OSM] ==========`);

    return limitedResults;
  } catch (error: any) {
    console.error('[OSM] ERROR occurred:');
    console.error('[OSM] Error message:', error?.message || 'Unknown error');
    if (error?.response) {
      console.error('[OSM] Response status:', error.response.status);
      console.error('[OSM] Response statusText:', error.response.statusText);
      console.error('[OSM] Response data:', JSON.stringify(error.response.data).substring(0, 500));
    }
    if (error?.code) {
      console.error('[OSM] Error code:', error.code);
    }
    console.error('[OSM] ==========');
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
