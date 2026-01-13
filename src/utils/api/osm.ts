import axios from 'axios';
import { normalizeForSearch, generateSearchVariants } from '../string';

// OpenStreetMap Overpass API
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';

// 簡易キャッシュ（メモリ内、5分間有効）
interface CacheEntry {
  data: OSMMountain[];
  timestamp: number;
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

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
  
  // キャッシュキーを生成
  const cacheKey = `${query}:${bbox?.join(',') || 'default'}:${limit}`;
  
  // キャッシュチェック
  const cached = searchCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    console.log(`[OSM] Cache HIT for "${query}" (${cached.data.length} results)`);
    return cached.data;
  }
  
  console.log(`[OSM] Cache MISS for "${query}", fetching from API...`);
  
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
    // 効率化のため、優先度順に地域を検索（人口密度が高く有名な山が多い順）
    const regions = [
      { name: '関東・中部', bbox: [35, 138, 36.5, 140.5] },
      { name: '近畿・中国・四国', bbox: [33.5, 130, 35, 136] },
      { name: '東北', bbox: [38, 139, 41, 142] },
      { name: '九州', bbox: [31, 129, 33.5, 132] },
      { name: '北海道', bbox: [41, 140, 45.5, 146] },
      { name: '沖縄', bbox: [24, 123, 27, 129] }
    ];
    
    const allMountains: OSMMountain[] = [];
    
    // 各地域を順番に検索（十分な結果が得られたら終了）
    for (const region of regions) {
      if (allMountains.length >= limit) {
        console.log(`[OSM] Already have ${allMountains.length} results, skipping remaining regions`);
        break;
      }
      
      const bbox = region.bbox;
      const overpassQuery = `
[out:json][timeout:30];
(
  node["natural"="peak"]["name"~"${query}",i](${bbox.join(',')});
  node["natural"="volcano"]["name"~"${query}",i](${bbox.join(',')});
);
out body 50;
      `.trim();

      console.log(`[OSM] Searching in ${region.name}...`);
      
      try {
        const response = await axios.post(
          OVERPASS_API,
          overpassQuery,
          {
            headers: { 'Content-Type': 'text/plain' },
            timeout: 35000  // 35秒
          }
        );

        if (response.data?.elements && Array.isArray(response.data.elements)) {
          const parsed = response.data.elements
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
                prefectures: [],
                source: 'OSM' as const,
                osmType: element.type as 'node' | 'way' | 'relation',
                osmId: element.id
              };
            });
          
          console.log(`[OSM] Found ${parsed.length} mountains in ${region.name}`);
          allMountains.push(...parsed);
        }
      } catch (regionError: any) {
        console.log(`[OSM] Error in ${region.name}: ${regionError?.message}, continuing to next region...`);
        continue;
      }
    }

    console.log(`[OSM] Total parsed: ${allMountains.length} mountains from all regions`);
    
    // クエリとマッチする結果のみを返す
    console.log(`[OSM] Filtering by query variants...`);
    const mountains = allMountains.filter((m: OSMMountain) => {
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
    
    // キャッシュに保存
    searchCache.set(cacheKey, {
      data: limitedResults,
      timestamp: Date.now()
    });
    console.log(`[OSM] Cached results for "${query}"`);
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
