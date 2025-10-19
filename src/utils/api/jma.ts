import axios from 'axios';

// 地域名 -> JMA 地域コードの簡易マップ（必要に応じて拡張してください）
const areaCodeMap: Record<string, string> = {
	'東京': '130000',
	'東京都': '130000',
	'札幌': '016010',
	'北海道': '016000',
	'大阪': '270000',
	'大阪府': '270000',
	'京都': '260000',
	'福岡': '400000',
	// 例: ユーザー指定のエリア名（地域区分）を追加
	'知床・阿寒': '016000', // 簡易に北海道でマップ
};

// ユーザ入力（地域名またはコード）を JMA の地域コードに解決する
export function resolveArea(input: string | undefined): string {
	if (!input) return '130000';
	const s = input.trim();
	// 既に数字のみならコードとして返す
	if (/^\d+$/.test(s)) return s;
	// マップに存在すれば返す
	const mapped = areaCodeMap[s];
	if (mapped) return mapped;
	// 部分一致（例: "北海道" が含まれる等）
	for (const key of Object.keys(areaCodeMap)) {
		if (s.includes(key)) return areaCodeMap[key];
	}
	// フォールバック
	return '130000';
}

/**
 * JMA のレスポンスを受け取り、人間向けの要約を返す。
 * fetchWeather は { raw, summary } を返します。
 */

function parseJMA(raw: any): string {
  if (Array.isArray(raw) && raw.length > 0) {
    const root = raw[0];
    const office = root.publishingOffice ?? '';
    const reportTime = root.reportDatetime ?? '';

    // 本文テキスト（あれば最優先）
    let bodyText = '';
    if (root.text) {
      if (Array.isArray(root.text) && root.text[0]?.body) bodyText = root.text[0].body;
      else if (typeof root.text === 'object' && root.text.body) bodyText = root.text.body;
      else if (typeof root.text === 'string') bodyText = root.text;
    }

    // timeSeries の areas 内の weather 等を探索
    if (!bodyText && Array.isArray(root.timeSeries)) {
      for (const ts of root.timeSeries) {
        if (Array.isArray(ts.areas) && ts.areas.length > 0) {
          const area = ts.areas[0];
          if (Array.isArray(area.weathers) && area.weathers[0]) {
            bodyText = area.weathers[0];
            break;
          }
          if (Array.isArray(area.remarks) && area.remarks[0]) {
            bodyText = area.remarks[0];
            break;
          }
          // sometimes 'weathers' is a string
          if (typeof area.weathers === 'string' && area.weathers) {
            bodyText = area.weathers;
            break;
          }
        }
      }
    }

    // 簡易整形・トリム
    const trimmed = (bodyText || '天気予報の要約が取得できませんでした。').trim();
    const short = trimmed.length > 1500 ? trimmed.slice(0, 1500) + '…' : trimmed;

    return `発表: ${office} ${reportTime}\n\n${short}`;
  }

  // フォールバック: 文字列化して短縮
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
    return s.length > 1900 ? s.slice(0, 1900) + '…' : s;
  } catch {
    return '天気情報の解析に失敗しました。';
  }
}

export async function fetchWeather(area: string) {
  try {
    const code = resolveArea(area);
    const url = `https://www.jma.go.jp/bosai/forecast/data/forecast/${encodeURIComponent(code)}.json`;
    const res = await axios.get(url, { timeout: 8000 });
    const raw = res.data;
    const summary = parseJMA(raw);
    return { raw, summary };
  } catch (err: any) {
    throw new Error(`JMA API error: ${err?.message || err}`);
  }
}
