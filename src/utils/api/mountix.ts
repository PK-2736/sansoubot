import axios from 'axios';
import prefecturesData from './prefectures.json';
import { supabase } from '../../utils/db';
import { normalizeForSearch, generateSearchVariants } from '../string';

export const BASE = process.env.MOUNTIX_API_BASE || 'https://mountix.codemountains.org/api/v1';
const API_KEY = process.env.MOUNTIX_API_KEY || '';

export interface Location {
  latitude?: number;
  longitude?: number;
  gsiUrl?: string;
  [k: string]: any;
}

export interface Mountain {
  id: string | number;
  name: string;
  nameKana?: string;
  area?: string;
  prefectures?: string[];
  elevation?: number;
  location?: Location;
  coords?: [number, number];
  gsiUrl?: string;
  description?: string;
  tags?: string[];
  photo_url?: string;
  raw?: any;
}

/* sample data (開発用フォールバック) - 最小限にする */
const sampleMountains: any[] = [
  { id: 1, name: '知床岳', nameKana: 'しれとこだけ', prefectures: ['北海道'], elevation: 1254, location: { latitude: 44.2358333333333, longitude: 145.273888888889, gsiUrl: 'https://maps.gsi.go.jp/#15/44.23583333333333/145.2738888888889' }, tags: [] }
];

function toNumberIfPossible(v: any) {
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeMountain(raw: any): Mountain {
  const id = raw.id ?? raw.properties?.id ?? String(raw.id ?? '');
  const name = raw.name ?? raw.title ?? raw.properties?.name ?? '不明';
  const nameKana = raw.nameKana ?? raw.properties?.nameKana ?? raw.kana ?? undefined;
  const elevation = toNumberIfPossible(raw.elevation ?? raw.altitude ?? raw.height ?? raw.properties?.elevation);

  const locationObj: Location | undefined = raw.location ?? raw.properties?.location ?? undefined;
  const lat = toNumberIfPossible(locationObj?.latitude ?? locationObj?.lat ?? raw.latitude ?? raw.lat ?? raw.geometry?.coordinates?.[1]);
  const lon = toNumberIfPossible(locationObj?.longitude ?? locationObj?.lon ?? raw.longitude ?? raw.lon ?? raw.geometry?.coordinates?.[0]);
  const coords = (typeof lat === 'number' && typeof lon === 'number') ? [lat, lon] as [number, number] : undefined;
  const gsi = locationObj?.gsiUrl ?? raw.gsiUrl ?? undefined;
  const description = raw.description ?? raw.summary ?? raw.overview ?? raw.note ?? raw.properties?.description ?? undefined;
  const tags = raw.tags ?? raw.properties?.tags ?? [];
  const prefectures = raw.prefectures ?? raw.properties?.prefectures ?? [];
  const photo_url = raw.photo_url ?? raw.image ?? raw.image_url ?? raw.properties?.photo_url ?? undefined;

  return { id, name, nameKana, elevation, coords, gsiUrl: gsi, location: locationObj, description, tags, prefectures, photo_url, raw };
}

export type SearchParams = {
  tag?: number | string;
  prefecture?: number | string;
  name?: string;
  offset?: number;
  limit?: number;
  sort?: string;
};

export async function searchMountains(params: SearchParams = {}): Promise<Mountain[]> {
  try {
    const headers: Record<string, string> = {};
    // Mountix は公開 API のため通常は API_KEY は不要です。
    // ただし将来的に認証が必要になる可能性があるため、環境変数が設定されていれば Authorization ヘッダを付与します。
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    const res = await axios.get(`${BASE}/mountains`, { params: params as any, headers, timeout: 8000 });
    const arr = Array.isArray(res.data) ? res.data : (res.data?.mountains ?? []);
    const results = arr.map(normalizeMountain);

    // If caller provided a name, apply an additional client-side normalization filter
    // to increase hit-rate across kanji/kana variants regardless of upstream behavior.
    if (params.name) {
      try {
        const q = normalizeForSearch(params.name);
        const qvars = generateSearchVariants(q);
  const filtered = results.filter((m: Mountain) => {
          const n1 = normalizeForSearch(m.name ?? '');
          const n2 = normalizeForSearch(m.nameKana ?? '');
          const variants = new Set<string>([n1, n2, n1.replace(/\s+/g,''), n2.replace(/\s+/g,'')]);
          // also add kana<->hira variants of the stored names
          generateSearchVariants(n1).forEach(v => variants.add(v));
          generateSearchVariants(n2).forEach(v => variants.add(v));
          // check if any query variant is substring of any stored variant
          for (const qv of qvars) {
            for (const sv of variants) {
              if (!sv) continue;
              if (sv.includes(qv) || qv.includes(sv)) return true;
            }
          }
          return false;
        });
        return filtered;
      } catch (e) {
        // if normalization fails, fall back to raw results
        return results;
      }
    }

    // Supabase から承認済みのユーザー追加山を検索して結合
    try {
      if (supabase && params.name) {
        const { data } = await supabase.from('user_mountains').select('*').ilike('name', `%${params.name}%`).eq('approved', true).limit(params.limit ?? 50).order('created_at', { ascending: false });
        if (data && Array.isArray(data)) {
          const userMounts = (data as any[]).map(d => normalizeMountain({ id: `user-${d.id}`, name: d.name, elevation: d.elevation, location: d.location ? { raw: d.location } : undefined, description: d.description, photo_url: d.photo_url, properties: {}, prefectures: [] }));
          return userMounts.concat(results);
        }
      }
    } catch (e) {
      // ignore supabase errors
    }

    return results;
  } catch (err: any) {
    // フォールバック: sampleMountains でフィルタ
    const qTag = params.tag ? String(params.tag) : undefined;
    const qPref = params.prefecture ? String(params.prefecture) : undefined;
    const qName = params.name ? String(params.name).toLowerCase() : undefined;

    let results = sampleMountains.slice();

    if (qTag) {
      const tagName = qTag === '1' ? '百名山' : qTag === '2' ? '二百名山' : undefined;
      if (tagName) results = results.filter(m => Array.isArray(m.tags) && m.tags.includes(tagName));
    }

    if (qPref) {
      // qPref が数値なら prefecturesData を使って県名に変換
      const pName = String(qPref);
  const maybeName = /^\\d+$/.test(pName) ? ((prefecturesData as any)[pName] as string | undefined) : undefined;
      const matchName = maybeName ?? pName;
      results = results.filter(m => Array.isArray(m.prefectures) && m.prefectures.some((p: string) => p.includes(matchName) || matchName.includes(p)));
    }

    if (qName) {
      results = results.filter(m => (m.name && m.name.toLowerCase().includes(qName)) || (m.nameKana && m.nameKana.includes(qName)));
    }

    const off = params.offset ?? 0;
    const lim = params.limit ?? 50;
    return results.slice(off, off + lim).map(normalizeMountain);
  }
}

export async function getMountain(id: string | number): Promise<Mountain> {
  try {
    const headers: Record<string, string> = {};
    // Mountix は公開 API のため通常は API_KEY は不要です。
    // ただし将来的に認証が必要になる可能性があるため、環境変数が設定されていれば Authorization ヘッダを付与します。
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    const res = await axios.get(`${BASE}/mountains/${encodeURIComponent(String(id))}`, { headers, timeout: 8000 });
    return normalizeMountain(res.data);
  } catch (err: any) {
    const q = String(id).toLowerCase();
    const found = sampleMountains.find(m => String(m.id) === q || (m.name && m.name.toLowerCase() === q) || (m.nameKana && m.nameKana === q));
    if (found) return normalizeMountain(found);
    throw new Error(`Mountix API error: ${err?.message || err}`);
  }
}

export async function getSurroundings(mountainId: string | number, distance = 5000): Promise<Mountain[]> {
  try {
    const headers: Record<string, string> = {};
    // Mountix は公開 API のため通常は API_KEY は不要です。
    // ただし将来的に認証が必要になる可能性があるため、環境変数が設定されていれば Authorization ヘッダを付与します。
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    const res = await axios.get(`${BASE}/mountains/${encodeURIComponent(String(mountainId))}/surroundings`, {
      params: { distance }, headers, timeout: 8000
    });
    const arr = Array.isArray(res.data) ? res.data : (res.data?.mountains ?? []);
    return arr.map(normalizeMountain);
  } catch (err: any) {
    const base = sampleMountains.find(m => String(m.id) === String(mountainId));
    if (!base) throw new Error(`Mountix API error: ${err?.message || err}`);
    const res = sampleMountains.filter(m => m.area === base.area && m.id !== base.id);
    return res.map(normalizeMountain);
  }
}

export async function geosearch(box: string, extra?: { tag?: number; name?: string; offset?: number; limit?: number }): Promise<Mountain[]> {
  try {
    const headers: Record<string, string> = {};
    // Mountix は公開 API のため通常は API_KEY は不要です。
    // ただし将来的に認証が必要になる可能性があるため、環境変数が設定されていれば Authorization ヘッダを付与します。
    if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
    const res = await axios.get(`${BASE}/mountains/geosearch`, { params: { box, ...extra } as any, headers, timeout: 8000 });
    const arr = Array.isArray(res.data) ? res.data : (res.data?.mountains ?? []);
    return arr.map(normalizeMountain);
  } catch (err: any) {
    let results = sampleMountains.slice();
    if (extra?.tag) {
      const tagName = extra.tag === 1 ? '百名山' : extra.tag === 2 ? '二百名山' : undefined;
      if (tagName) results = results.filter(m => Array.isArray(m.tags) && m.tags.includes(tagName));
    }
    if (extra?.name) {
      const q = String(extra.name).toLowerCase();
      results = results.filter(m => m.name.toLowerCase().includes(q) || (m.nameKana && m.nameKana.includes(q)));
    }
    const off = extra?.offset ?? 0;
    const lim = extra?.limit ?? 50;
    return results.slice(off, off + lim).map(normalizeMountain);
  }
}

export function getPrefectures(): Record<string, string> {
  return prefecturesData as Record<string, string>;
}

export function prefectureIdToName(id: number | string): string | undefined {
  return (prefecturesData as any)[String(id)];
}

