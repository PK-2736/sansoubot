import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma } from './db';
import { log } from './logger';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

interface GeminiQuizQuestion {
  question: string;
  options: string[];
  answer: string;
}

/**
 * Gemini APIを使って登山クイズを生成する
 * モデル: gemini-1.5-flash（無料枠: 1日1500リクエスト、1分15リクエスト）
 */
export async function generateGeminiQuizQuestions(count: number = 7): Promise<GeminiQuizQuestion[]> {
  if (!GEMINI_API_KEY) {
    log('[GeminiQuiz] API key not set, skipping generation');
    return [];
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    // Gemini 2.5 Flash (無料枠で利用可能)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `実践的な登山知識を問う4択クイズを${count}問生成してください。

要件:
- 登山の安全、装備選択、気象判断、高山病対策、ルートファインディング、遭難対策など実践的な知識
- 問題文は30文字以内、選択肢は15文字以内の簡潔な文にする
- 各問題は4つの選択肢を持つ
- 正解は選択肢の中の1つ
- 中級者から上級者向けの実用的で難易度の高い内容
- 実際の登山で役立つ知識を重視
- JSON配列形式で出力（他のテキストは含めない）

出力形式:
[
  {
    "question": "問題文",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "answer": "選択肢1"
  }
]

例:
[
  {
    "question": "雷雲接近時の最優先行動は？",
    "options": ["即座に下山", "樹木の下へ", "岩陰に隠れる", "テント設営"],
    "answer": "即座に下山"
  },
  {
    "question": "高山病予防で最も重要なのは？",
    "options": ["ゆっくり登る", "水分制限", "速く登る", "深呼吸しない"],
    "answer": "ゆっくり登る"
  },
  {
    "question": "森林限界を超える標高は？",
    "options": ["2500m前後", "1000m前後", "3500m前後", "500m前後"],
    "answer": "2500m前後"
  }
]`;

    log(`[GeminiQuiz] Generating ${count} questions...`);
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    log(`[GeminiQuiz] Raw response length: ${text.length}`);

    // JSONを抽出（マークダウンのコードブロックなどを除去）
    let jsonText = text.trim();
    // ```json ``` で囲まれている場合は除去
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    const questions: GeminiQuizQuestion[] = JSON.parse(jsonText);
    log(`[GeminiQuiz] Successfully generated ${questions.length} questions`);

    return questions;
  } catch (error: any) {
    log('[GeminiQuiz] Error generating questions:', error?.message ?? error);
    return [];
  }
}

/**
 * 生成されたクイズをデータベースに保存（重複チェック付き）
 */
export async function saveGeminiQuizQuestions(questions: GeminiQuizQuestion[]): Promise<number> {
  let savedCount = 0;

  for (const q of questions) {
    try {
      // 重複チェック: 同じ問題文が既にあるかチェック
      const existing = await prisma.quizQuestion.findFirst({
        where: { question: q.question }
      });

      if (existing) {
        log(`[GeminiQuiz] Skipping duplicate question: "${q.question.substring(0, 30)}..."`);
        continue;
      }

      // 保存
      await prisma.quizQuestion.create({
        data: {
          question: q.question,
          options: JSON.stringify(q.options),
          answer: q.answer,
          source: 'gemini',
          image_url: null,
        }
      });

      savedCount++;
      log(`[GeminiQuiz] Saved new question: "${q.question.substring(0, 30)}..."`);
    } catch (error: any) {
      log(`[GeminiQuiz] Error saving question: ${error?.message ?? error}`);
    }
  }

  log(`[GeminiQuiz] Saved ${savedCount}/${questions.length} new questions`);
  return savedCount;
}

/**
 * データベースから指定数のGeminiクイズを取得
 */
export async function getGeminiQuizQuestions(count: number): Promise<any[]> {
  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { source: 'gemini' },
      orderBy: { created_at: 'desc' },
      take: count * 3, // 候補を多めに取得してランダムに選択
    });

    // ランダムにシャッフルして指定数を返す
    const shuffled = questions.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  } catch (error: any) {
    log(`[GeminiQuiz] Error fetching questions: ${error?.message ?? error}`);
    return [];
  }
}
