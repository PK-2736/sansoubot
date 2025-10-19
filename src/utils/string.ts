// 小さめの検索正規化ユーティリティ
// 目的: 漢字・ひらがな・カタカナの表記ゆれをある程度吸収し、検索マッチ精度を上げる
export function kataToHira(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function hiraToKata(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

export function normalizeForSearch(input?: string): string {
  if (!input) return '';
  try {
    let s = String(input).normalize('NFKC');
    // trim and collapse spaces
    s = s.replace(/[\u3000\s]+/g, ' ').trim();
    // remove most punctuation but keep CJK, kana and common punctuation used in Japanese ranges
    s = s.replace(/[\p{P}\p{S}]+/gu, '');
    // lowercase for latin parts
    s = s.toLowerCase();
    return s;
  } catch (e) {
    return String(input);
  }
}

// generate variants for a normalized string: itself, hira/kata variants, and no-space version
export function generateSearchVariants(normed: string): string[] {
  const out = new Set<string>();
  const base = normed || '';
  out.add(base);
  out.add(base.replace(/\s+/g, ''));
  try {
    out.add(kataToHira(base));
    out.add(hiraToKata(base));
    out.add(kataToHira(base).replace(/\s+/g, ''));
    out.add(hiraToKata(base).replace(/\s+/g, ''));
  } catch (e) {
    // ignore
  }
  return Array.from(out).filter(x => x.length > 0);
}
