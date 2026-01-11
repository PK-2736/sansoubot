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

/**
 * 山名を解析して漢字部分とよみがな部分に分離する
 * カタカナとひらがなの重複がある場合は、カタカナのみを保存
 * 例: "宿弗山シュッタヤマしゅったやま" → { name: "宿弗山", nameKana: "シュッタヤマ" }
 * 例: "富士山" → { name: "富士山", nameKana: undefined }
 * 例: "八ヶ岳やつがたけ" → { name: "八ヶ岳", nameKana: "やつがたけ" }
 */
export function parseMountainName(input: string): { name: string; nameKana?: string } {
  if (!input) return { name: '' };
  
  // 山名に使われる特殊文字（ヶ、々など）
  const nameCharRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\u3005\u30F6]/; // 漢字 + 々 + ヶ
  const kanjiRegex = /[\u4E00-\u9FFF\u3400-\u4DBF]/; // 漢字のみ
  
  // 入力文字列を先頭から解析
  let namePart = '';
  let kanaPart = '';
  let foundKana = false;
  let hasKanji = false;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const isNameChar = nameCharRegex.test(char);
    const isKanji = kanjiRegex.test(char);
    // ひらがな or カタカナ（ただし「ヶ」を除く）
    const isKana = /[\u3040-\u309F\u30A0-\u30F5\u30F7-\u30FF]/.test(char);
    
    if (isKanji) hasKanji = true;
    
    if (!foundKana && (isNameChar || !isKana)) {
      // まだよみがな部分に到達していない場合は山名部分に追加
      namePart += char;
    } else if (isKana) {
      // よみがな部分を発見
      // ただし、漢字が一つもなく、カタカナだけで始まる場合は山名として扱う
      if (!hasKanji && !foundKana && /[\u30A0-\u30FF]/.test(char)) {
        namePart += char;
        continue;
      }
      foundKana = true;
      kanaPart += char;
    } else if (foundKana) {
      // よみがな部分に到達した後の文字もよみがな部分に含める
      kanaPart += char;
    }
  }
  
  // よみがな部分の処理：カタカナとひらがなの重複を検出
  let nameKana: string | undefined = kanaPart.trim() || undefined;
  
  if (nameKana) {
    // カタカナ部分とひらがな部分を分離
    const kataPart = nameKana.replace(/[\u3040-\u309F]/g, '').trim();
    const hiraPart = nameKana.replace(/[\u30A0-\u30FF]/g, '').trim();
    
    // カタカナとひらがなの両方が存在する場合
    if (kataPart && hiraPart) {
      // カタカナをひらがなに変換して比較
      const kataToHiraConverted = kataToHira(kataPart);
      const hiraToKataConverted = hiraToKata(hiraPart);
      
      // 正規化して比較（空白を削除）
      const kataConverted = kataToHiraConverted.replace(/\s+/g, '');
      const hiraOriginal = hiraPart.replace(/\s+/g, '');
      
      // 重複している場合（カタカナ→ひらがな変換と元のひらがなが一致）
      if (kataConverted === hiraOriginal || kataConverted.includes(hiraOriginal) || hiraOriginal.includes(kataConverted)) {
        // カタカナのみを保存
        nameKana = kataPart;
      }
      // 完全に異なる場合は両方を保持（元のまま）
    }
  }
  
  const name = namePart.trim() || input.trim();
  
  return { name, nameKana };
}
