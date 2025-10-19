import axios from 'axios';
import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.resolve(__dirname, '..', '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'wiki-images.json');

type CacheEntry = { url: string | null; ts: number };
type Cache = Record<string, CacheEntry>;

// TTL（時間単位、デフォルト 720 = 30 日）
const TTL_HOURS = Number(process.env.WIKI_CACHE_TTL_HOURS ?? '720');
const TTL_MS = Math.max(0, TTL_HOURS) * 60 * 60 * 1000;

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
}

function readCache(): Cache {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Cache;
    // prune expired
    if (TTL_MS > 0) {
      const now = Date.now();
      let changed = false;
      for (const k of Object.keys(parsed)) {
        const e = parsed[k];
        if (!e || !e.ts || now - e.ts > TTL_MS) {
          delete parsed[k];
          changed = true;
        }
      }
      if (changed) writeCache(parsed);
    }
    return parsed;
  } catch (e) {
    return {};
  }
}

function writeCache(c: Cache) {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2), 'utf8');
  } catch (e) {
    // ignore
  }
}

async function fetchThumbnailForTitle(titleRaw: string): Promise<string | undefined> {
  try {
    const title = String(titleRaw);
    // Try REST summary endpoint first to get original image
    const summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const summaryRes = await axios.get(summaryUrl, { timeout: 5000 });
  const original = summaryRes.data?.originalimage?.source;
  if (original && typeof original === 'string') return ensureHttps(original);
    } catch (e) {
      // ignore and fallback to pageimages
    }

    const apiUrl = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=1000&redirects=1`;
    const res = await axios.get(apiUrl, { timeout: 5000 });
    const pages = res.data?.query?.pages;
    if (!pages) return undefined;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    if (!page) return undefined;
    const thumb = page?.thumbnail?.source;
    if (thumb && typeof thumb === 'string') return ensureHttps(thumb);
    return undefined;
  } catch (err) {
    return undefined;
  }
}

function ensureHttps(url: string): string {
  try {
    if (!url) return url;
    let u = String(url).trim();
    if (u.startsWith('//')) u = 'https:' + u;
    if (u.startsWith('http:')) u = 'https:' + u.slice(5);
    return u;
  } catch (e) {
    return url;
  }
}

/**
 * 指定した山名から候補を作成し、Wikipedia の代表画像を取得します。
 * 取得結果はファイルにキャッシュされ、次回以降の API 呼び出しを削減します。
 */
export default async function fetchWikipediaImage(pageName: string, nameKana?: string): Promise<string | undefined> {
  if (!pageName) return undefined;

  // キャッシュチェック
  const cache = readCache();
  const cached = cache[pageName];
  if (cached !== undefined) return cached?.url ?? undefined;

  const candidates = new Set<string>();
  candidates.add(pageName);
  if (nameKana) candidates.add(nameKana);
  // common suffixes
  candidates.add(`${pageName} 山`);
  candidates.add(`${pageName} 岳`);
  candidates.add(`${pageName}（山）`);
  candidates.add(`${pageName} (山)`);

  let found: string | undefined;
  for (const c of candidates) {
    const img = await fetchThumbnailForTitle(c);
    if (img) {
      found = img;
      break;
    }
  }

  // キャッシュ保存
  cache[pageName] = { url: found ?? null, ts: Date.now() };
  writeCache(cache);

  return found;
}

/**
 * 指定したページ名の Wikipedia サマリー（抜粋）を取得します。
 * 返却値の形は { title, extract, description, originalimage } です。見つからない場合は undefined を返します。
 */
export async function fetchWikipediaSummary(titleRaw: string): Promise<any | undefined> {
  try {
    if (!titleRaw) return undefined;
    const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(titleRaw))}`;
    const res = await axios.get(url, { timeout: 5000 });
    if (res.status !== 200) return undefined;
    return res.data;
  } catch (e) {
    return undefined;
  }
}
