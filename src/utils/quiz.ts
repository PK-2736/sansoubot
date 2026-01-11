import fs from 'fs';
import path from 'path';
import { searchMountains } from './api/mountix';
import { generateGeminiQuizQuestions, saveGeminiQuizQuestions, getGeminiQuizQuestions } from './geminiQuiz';
import { log } from './logger';

type QuizQuestion = {
  id: string;
  type: 'elevation' | 'name' | 'pref' | 'desc' | 'photo' | 'gemini';
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

/**
 * Mountixクイズを3問生成
 */
async function buildMountixQuiz(): Promise<QuizQuestion[]> {
  // Mountix から山の候補プールを取得
  const pool = await searchMountains({ limit: 200 }).catch(() => []);
  // name, elevation, prefectures のみを必須とする緩和ルール
  const mountains = (pool || []).filter((m: any) => m && m.name && m.elevation && Array.isArray(m.prefectures) && m.prefectures.length > 0);
  if (mountains.length < 20) throw new Error('not enough mountains to build quiz');

  // 難易度を下げる: 有名山（標高順上位）や都道府県分布を重視
  mountains.sort((a: any, b: any) => (b.elevation || 0) - (a.elevation || 0));
  const topMountains = mountains.slice(0, 50);

  const questions: QuizQuestion[] = [];
  const types: QuizQuestion['type'][] = ['elevation', 'name', 'pref'];
  // Mountixからは3問のみ生成
  const maxAttempts = 100;
  let attempts = 0;
  while (questions.length < 3 && attempts < maxAttempts) {
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
      }
    } catch (e) {
      continue;
    }
  }
  
  // 3問に満たない場合は name 問で埋める
  if (questions.length < 3) {
    const used = new Set(questions.map(q => q.id));
    const candidates = topMountains.filter((m: any) => !used.has(String(m.id)));
    while (questions.length < 3 && candidates.length) {
      const item = candidates.shift();
      if (!item) break;
      const correct = item.name;
      const poolNames = pick(topMountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
      const arr = pick([correct, ...poolNames], 4);
      const answerIndex = arr.indexOf(correct);
      questions.push({ id: String(item.id), type: 'name', prompt: `この山の名前はどれ？ 標高: ${item.elevation} m`, choices: arr, answerIndex, meta: item, answerText: correct });
    }
  }
  
  return questions;
}

/**
 * Geminiクイズを7問生成（毎回新規生成）
 */
async function buildGeminiQuiz(): Promise<QuizQuestion[]> {
  const questions: QuizQuestion[] = [];
  
  try {
    // 毎回新規生成（キャッシュを使わない）
    log(`[QuizBuilder] Generating 7 new Gemini quizzes...`);
    const newQuizzes = await generateGeminiQuizQuestions(7);
    
    // 新規生成したクイズをDBに保存（履歴として）
    if (newQuizzes.length > 0) {
      await saveGeminiQuizQuestions(newQuizzes);
    }
    
    // 新規生成分を形式変換して追加
    for (const q of newQuizzes) {
      const answerIndex = q.options.indexOf(q.answer);
      if (answerIndex === -1) {
        log(`[QuizBuilder] Skipping quiz: answer not found in options`);
        continue;
      }
      
      questions.push({
        id: `gemini_${Date.now()}_${Math.random()}`,
        type: 'gemini',
        prompt: q.question,
        choices: q.options,
        answerIndex,
        meta: { source: 'gemini' },
        answerText: q.answer,
      });
    }
    
    log(`[QuizBuilder] Total Gemini questions: ${questions.length}`);
  } catch (error: any) {
    log(`[QuizBuilder] Error building Gemini quiz: ${error?.message ?? error}`);
  }
  
  return questions;
}

/**
 * 混合クイズを生成（Mountix 3問 + Gemini 7問）
 */
export async function buildQuiz(): Promise<QuizQuestion[]> {
  try {
    log('[QuizBuilder] Building mixed quiz (3 Mountix + 7 Gemini)...');
    
    // Mountix 3問 と Gemini 7問を並列で生成
    const [mountixQuestions, geminiQuestions] = await Promise.all([
      buildMountixQuiz(),
      buildGeminiQuiz(),
    ]);
    
    log(`[QuizBuilder] Generated ${mountixQuestions.length} Mountix, ${geminiQuestions.length} Gemini questions`);
    
    // 全問題を結合してシャッフル
    const allQuestions = [...mountixQuestions, ...geminiQuestions];
    const shuffled = allQuestions.sort(() => Math.random() - 0.5);
    
    // 10問に調整（不足の場合はそのまま、超過の場合は切り詰め）
    const finalQuestions = shuffled.slice(0, 10);
    
    log(`[QuizBuilder] Final quiz: ${finalQuestions.length} questions`);
    
    // 生成したクイズをタイムスタンプ付きでディスクにキャッシュ
    const filename = path.join(CACHE_DIR, `quiz_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify({ created_at: Date.now(), questions: finalQuestions }));
    
    return finalQuestions;
  } catch (error: any) {
    log(`[QuizBuilder] Error in buildQuiz: ${error?.message ?? error}`);
    // フォールバック: エラー時はMountixのみで10問生成
    log('[QuizBuilder] Falling back to Mountix-only quiz...');
    const pool = await searchMountains({ limit: 200 }).catch(() => []);
    const mountains = (pool || []).filter((m: any) => m && m.name && m.elevation);
    if (mountains.length < 10) throw new Error('not enough mountains to build fallback quiz');
    
    mountains.sort((a: any, b: any) => (b.elevation || 0) - (a.elevation || 0));
    const topMountains = mountains.slice(0, 50);
    const questions: QuizQuestion[] = [];
    
    while (questions.length < 10 && topMountains.length) {
      const item = topMountains.shift();
      if (!item) break;
      const correct = item.name;
      const poolNames = pick(mountains.filter((m: any) => m.id !== item.id), 3).map((x: any) => x.name);
      const arr = pick([correct, ...poolNames], 4);
      const answerIndex = arr.indexOf(correct);
      questions.push({ 
        id: String(item.id), 
        type: 'name', 
        prompt: `この山の名前はどれ？ 標高: ${item.elevation} m`, 
        choices: arr, 
        answerIndex, 
        meta: item, 
        answerText: correct 
      });
    }
    
    const filename = path.join(CACHE_DIR, `quiz_${Date.now()}.json`);
    fs.writeFileSync(filename, JSON.stringify({ created_at: Date.now(), questions }));
    return questions;
  }
}

export function loadLatestQuiz(): QuizQuestion[] | null {
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('quiz_')).sort();
  if (!files.length) return null;
  const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, files[files.length - 1]), 'utf8'));
  return data.questions;
}

export type { QuizQuestion };
