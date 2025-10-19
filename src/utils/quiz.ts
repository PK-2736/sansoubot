import fs from 'fs';
import path from 'path';
import { searchMountains } from './api/mountix';

type QuizQuestion = {
  id: string;
  type: 'elevation' | 'name' | 'pref' | 'desc' | 'photo';
  prompt: string;
  choices: string[];
  answerIndex: number;
  meta: any;
  answerText?: string; // 正答表示用
};

const CACHE_DIR = path.join(process.cwd(), 'src', '.cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function pick<T>(arr: T[], n: number) {
  const copy = arr.slice();
  const out: T[] = [];
  while (out.length < n && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

export async function buildQuiz(): Promise<QuizQuestion[]> {
  // Mountix から山の候補プールを取得
  const pool = await searchMountains({ limit: 200 }).catch(() => []);
  // name, elevation, prefectures のみを必須とする緩和ルール
  const mountains = (pool || []).filter((m: any) => m && m.name && m.elevation && Array.isArray(m.prefectures) && m.prefectures.length > 0);
  if (mountains.length < 20) throw new Error('not enough mountains to build quiz');

  // 難易度を下げる: 有名山（標高順上位）や都道府県分布を重視
  mountains.sort((a: any, b: any) => (b.elevation || 0) - (a.elevation || 0));
  const topMountains = mountains.slice(0, 50);

  const questions: QuizQuestion[] = [];
  const types: QuizQuestion['type'][] = ['elevation', 'name', 'pref', 'desc', 'photo'];
  // 可能な限り 10 問を生成することを保証します
  const maxAttempts = 100; // 無限ループを避けるための試行回数上限
  let attempts = 0;
  while (questions.length < 10 && attempts < maxAttempts) {
    attempts++;
    const type = types[questions.length % types.length];
    const item = pick(topMountains, 1)[0];
    if (!item) continue;
    try {
      if (type === 'elevation') {
        const elev = Number(item.elevation || 0);
        const correct = String(elev);
        const choices = new Set<string>([correct]);
        while (choices.size < 4) {
          const delta = Math.round((Math.random() * 200) - 100);
          choices.add(String(Math.max(0, elev + delta)));
        }
        const arr = Array.from(choices).sort((a, b) => Number(a) - Number(b));
        const answerIndex = arr.indexOf(correct);
        questions.push({ id: String(item.id), type, prompt: `標高が ${item.name} のものはどれ？ (m)`, choices: arr, answerIndex, meta: item, answerText: correct });
      } else if (type === 'name') {
        const correct = item.name;
        const poolNames = pick(topMountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
        const arr = pick([correct, ...poolNames], 4);
        const answerIndex = arr.indexOf(correct);
        questions.push({ id: String(item.id), type, prompt: `この山の名前はどれ？ 標高: ${item.elevation} m`, choices: arr, answerIndex, meta: item, answerText: correct });
      } else if (type === 'pref') {
        const correct = Array.isArray(item.prefectures) && item.prefectures.length > 0 ? item.prefectures[0] : '不明';
        const poolPrefs = pick([...new Set(topMountains.filter((m: any) => m.id !== item.id && Array.isArray(m.prefectures) && m.prefectures.length > 0).map((x: any) => x.prefectures[0]))], 3);
        const arr = pick([correct, ...poolPrefs], 4);
        const answerIndex = arr.indexOf(correct);
        questions.push({ id: String(item.id), type, prompt: `${item.name} の都道府県はどれ？`, choices: arr, answerIndex, meta: item, answerText: correct });
      } else if (type === 'desc') {
        if (!item.description) continue;
        const correct = item.name;
        const poolNames = pick(topMountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
        const arr = pick([correct, ...poolNames], 4);
        const answerIndex = arr.indexOf(correct);
        const desc = (item.description || '').replace(/\s+/g, ' ').slice(0, 40) + '...';
        questions.push({ id: String(item.id), type, prompt: `説明: 「${desc}」 この山の名前は？`, choices: arr, answerIndex, meta: item, answerText: correct });
      } else if (type === 'photo') {
        if (!item.photo_url) continue;
        const correct = item.name;
        const poolNames = pick(topMountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
        const arr = pick([correct, ...poolNames], 4);
        const answerIndex = arr.indexOf(correct);
        questions.push({ id: String(item.id), type, prompt: `この写真の山は？\n${item.photo_url}`, choices: arr, answerIndex, meta: item, answerText: correct });
      }
      } catch (e) {
        // 予期しないエラーはスキップしつつ生成は継続します
        continue;
      }
  }
  // 試行後に 10 問に満たない場合、残りをシンプルな 'name' 問で埋めます
  if (questions.length < 10) {
    const used = new Set(questions.map(q => q.id));
    const candidates = topMountains.filter((m: any) => !used.has(String(m.id)));
    while (questions.length < 10 && candidates.length) {
      const item = candidates.shift();
      if (!item) break;
      const correct = item.name;
      const poolNames = pick(topMountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
      const arr = pick([correct, ...poolNames], 4);
      const answerIndex = arr.indexOf(correct);
      questions.push({ id: String(item.id), type: 'name', prompt: `この山の名前はどれ？ 標高: ${item.elevation} m`, choices: arr, answerIndex, meta: item, answerText: correct });
    }
  }

  // 生成したクイズをタイムスタンプ付きでディスクにキャッシュします
  const filename = path.join(CACHE_DIR, `quiz_${Date.now()}.json`);
  fs.writeFileSync(filename, JSON.stringify({ created_at: Date.now(), questions }));
  return questions;
}

export function loadLatestQuiz(): QuizQuestion[] | null {
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('quiz_')).sort();
  if (!files.length) return null;
  const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, files[files.length - 1]), 'utf8'));
  return data.questions;
}

export type { QuizQuestion };
