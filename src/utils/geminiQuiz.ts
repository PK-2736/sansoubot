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

    const prompt = `日本の登山に関する4択クイズを${count}問生成してください。

要件:
- 日本の山、登山道具、登山マナー、高山植物、山岳地形などについての問題
- 各問題は4つの選択肢を持つ
- 正解は選択肢の中の1つ
- 初心者から中級者向けの難易度
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
    "question": "日本三名山に含まれない山はどれ？",
    "options": ["富士山", "立山", "白山", "槍ヶ岳"],
    "answer": "槍ヶ岳"
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
