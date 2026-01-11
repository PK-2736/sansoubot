// Gemini クイズ生成のテストスクリプト
require('dotenv').config();

async function testGeminiQuiz() {
  console.log('Testing Gemini quiz generation...\n');
  
  // Prisma初期化
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  // Geminiユーティリティをインポート
  const { generateGeminiQuizQuestions, saveGeminiQuizQuestions, getGeminiQuizQuestions } = require('./dist/utils/geminiQuiz');
  
  try {
    // 1. クイズ生成テスト
    console.log('1. Generating 3 quiz questions with Gemini...');
    const questions = await generateGeminiQuizQuestions(3);
    console.log(`✓ Generated ${questions.length} questions\n`);
    
    if (questions.length > 0) {
      console.log('Sample question:');
      console.log(JSON.stringify(questions[0], null, 2));
      console.log('');
      
      // 2. DB保存テスト
      console.log('2. Saving questions to database...');
      const saved = await saveGeminiQuizQuestions(questions);
      console.log(`✓ Saved ${saved} questions\n`);
      
      // 3. DB取得テスト
      console.log('3. Fetching questions from database...');
      const fetched = await getGeminiQuizQuestions(5);
      console.log(`✓ Fetched ${fetched.length} questions from DB\n`);
      
      if (fetched.length > 0) {
        console.log('Sample fetched question:');
        console.log(JSON.stringify(fetched[0], null, 2));
      }
    }
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testGeminiQuiz();
