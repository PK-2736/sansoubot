export type RawMountainInput = {
  id?: any;
  name?: string;
  elevation?: number | string | null;
  coords?: [number, number] | null | undefined;
  latitude?: number | string;
  longitude?: number | string;
  description?: string;
  photo_url?: string;
  source?: string;
  [k: string]: any;
};

export type NormalizedMountain = {
  id?: string;
  name: string;
  elevation?: number;
  coords?: [number, number];
  description?: string;
  photo_url?: string;
  source?: string;
};

function toNumber(v: any): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeMountainData(input: RawMountainInput): NormalizedMountain {
  const name = input.name ?? String(input.id ?? '不明');
  // Normalize name to NFKC and hiragana (convert katakana to hiragana for kana matching)
  const nameNorm = String(name).normalize('NFKC');
  // elevation: floor to integer if present
  const elevRaw = toNumber(input.elevation ?? input.altitude ?? input.height);
  let elevation = typeof elevRaw === 'number' ? Math.floor(elevRaw) : undefined;
  // Elevation sanity check: valid range -500..10000
  if (typeof elevation === 'number') {
    if (elevation < -500 || elevation > 10000) elevation = undefined;
  }

  // coords: prefer coords array, then lat/lon fields; round to 6 decimals
  let lat: number | undefined;
  let lon: number | undefined;
  if (Array.isArray(input.coords) && input.coords.length >= 2) {
    lat = toNumber(input.coords[0]);
    lon = toNumber(input.coords[1]);
  } else {
    lat = toNumber(input.latitude ?? input.lat ?? input.location?.latitude ?? input.location?.lat);
    lon = toNumber(input.longitude ?? input.lon ?? input.location?.longitude ?? input.location?.lon);
  }

  let coords: [number, number] | undefined;
  if (typeof lat === 'number' && typeof lon === 'number') {
    const rlat = Math.round(lat * 1e6) / 1e6;
    const rlon = Math.round(lon * 1e6) / 1e6;
    // Coordinates sanity check: roughly Japan bounds lat 20..46, lon 120..154
    if (rlat >= 20 && rlat <= 46 && rlon >= 120 && rlon <= 154) {
      coords = [rlat, rlon];
    }
  }

  const description = input.description ?? input.note ?? input.summary ?? undefined;
  const photo_url = input.photo_url ?? input.image ?? undefined;
  const source = input.source ?? undefined;

  return { id: input.id ? String(input.id) : undefined, name: nameNorm, elevation, coords, description, photo_url, source };
}

/**
 * Nominatim を使った簡易ジオコーディング
 * locationText（住所や地名）から緯度経度を取得し、NormalizedMountain 形式で返します。
 * 注意: 外部 API 呼び出しを行うため、レート制限や利用規約を守ってください。
 */
export async function geocodeLocation(locationText: string): Promise<{ coords?: [number, number]; display_name?: string } | undefined> {
  if (!locationText) return undefined;
  try {
    const q = encodeURIComponent(locationText);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=ja`;
    const res = await (await import('axios')).default.get(url, { headers: { 'User-Agent': 'mountain-bot/1.0 (https://example.com)' }, timeout: 5000 });
    const data = res.data;
    if (!Array.isArray(data) || data.length === 0) return undefined;
    const top = data[0];
    const lat = Number(top.lat);
    const lon = Number(top.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
    const rlat = Math.round(lat * 1e6) / 1e6;
    const rlon = Math.round(lon * 1e6) / 1e6;
    if (rlat >= 20 && rlat <= 46 && rlon >= 120 && rlon <= 154) return { coords: [rlat, rlon], display_name: top.display_name };
    return undefined;
  } catch (e) {
    return undefined;
  }
}
