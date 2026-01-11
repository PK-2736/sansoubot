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
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    // Try REST summary endpoint first to get original image
    const summaryUrl = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const summaryRes = await axios.get(summaryUrl, { timeout: 5000, headers });
      const original = summaryRes.data?.originalimage?.source;
      if (original && typeof original === 'string') {
        console.log(`[fetchThumbnailForTitle] Got image for "${title}" from summary`);
        return ensureHttps(original);
      }
    } catch (e: any) {
      console.log(`[fetchThumbnailForTitle] Summary endpoint failed for "${title}": ${e?.message}`);
      // ignore and fallback to pageimages
    }

    const apiUrl = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=1000&redirects=1`;
    console.log(`[fetchThumbnailForTitle] Trying pageimages API for "${title}"`);
    const res = await axios.get(apiUrl, { timeout: 5000, headers });
    const pages = res.data?.query?.pages;
    if (!pages) {
      console.log(`[fetchThumbnailForTitle] No pages returned for "${title}"`);
      return undefined;
    }
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];
    if (!page) {
      console.log(`[fetchThumbnailForTitle] Page not found for "${title}"`);
      return undefined;
    }
    const thumb = page?.thumbnail?.source;
    if (thumb && typeof thumb === 'string') {
      console.log(`[fetchThumbnailForTitle] Got image for "${title}" from pageimages: ${thumb.substring(0, 50)}`);
      return ensureHttps(thumb);
    }
    console.log(`[fetchThumbnailForTitle] No thumbnail found for "${title}", page:`, JSON.stringify(page));
    return undefined;
  } catch (err: any) {
    console.log(`[fetchThumbnailForTitle] Error for "${titleRaw}": ${err?.message}`);
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
 * 複数候補を並列で試し、最初に見つかった画像を返します。
 */
export default async function fetchWikipediaImage(pageName: string, nameKana?: string): Promise<string | undefined> {
  if (!pageName) return undefined;

  // キャッシュチェック（成功した結果のみキャッシュを信用する）
  const cache = readCache();
  const cached = cache[pageName];
  if (cached !== undefined && cached.url !== null) {
    console.log(`[fetchWikipediaImage] Cache hit for "${pageName}": ${cached.url?.substring(0, 50) ?? 'null'}`);
    return cached?.url ?? undefined;
  }

  console.log(`[fetchWikipediaImage] Starting fetch for "${pageName}" (kana: ${nameKana})`);
  
  // 山名から無効な文字（<>など）を削除してクリーンな名前を作成
  // 例：「富士山<剣ヶ峯>」→「富士山」
  const cleanName = pageName.replace(/<[^>]+>/g, '').trim();
  const cleanNameKana = nameKana ? nameKana.replace(/<[^>]+>/g, '').trim() : undefined;
  
  const candidates: string[] = [];
  // クリーンな名前を優先
  if (cleanName && cleanName !== pageName) {
    candidates.push(cleanName);
    if (cleanNameKana && cleanNameKana !== nameKana) candidates.push(cleanNameKana);
  }
  // 元の名前も試す
  candidates.push(pageName);
  if (nameKana) candidates.push(nameKana);
  // common suffixes to try
  candidates.push(`${cleanName} 山`);
  candidates.push(`${cleanName} 岳`);
  candidates.push(`${cleanName}（山）`);
  candidates.push(`${cleanName} (山)`);
  // Remove duplicates
  const uniqueCandidates = [...new Set(candidates)];
  
  console.log(`[fetchWikipediaImage] Trying ${uniqueCandidates.length} candidates for "${pageName}" (clean: "${cleanName}")`);

  let found: string | undefined;
  // 並列ですべての候補を試して、最初に見つかったものを使用
  const results = await Promise.allSettled(
    uniqueCandidates.map(c => fetchThumbnailForTitle(c))
  );
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled' && result.value) {
      found = result.value;
      console.log(`[fetchWikipediaImage] Found image at candidate ${i}: ${uniqueCandidates[i]}`);
      break;
    }
  }

  if (found) {
    console.log(`[fetchWikipediaImage] Successfully fetched for "${pageName}": ${found.substring(0, 50)}`);
  } else {
    console.log(`[fetchWikipediaImage] No image found for "${pageName}" after trying ${uniqueCandidates.length} candidates`);
  }

  // キャッシュ保存（成功した場合のみ保存）
  if (found) {
    cache[pageName] = { url: found, ts: Date.now() };
    writeCache(cache);
  }

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
