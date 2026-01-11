// 混合クイズビルドテスト (Mountix 3問 + Gemini 7問)
require('dotenv').config();

async function testMixedQuiz() {
  console.log('Testing mixed quiz generation (3 Mountix + 7 Gemini)...\n');
  
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  const { buildQuiz } = require('./dist/utils/quiz');
  
  try {
    console.log('Building quiz...\n');
    const questions = await buildQuiz();
    
    console.log(`✅ Generated ${questions.length} questions total\n`);
    
    // クイズの内訳を表示
    const mountixCount = questions.filter(q => q.type !== 'gemini').length;
    const geminiCount = questions.filter(q => q.type === 'gemini').length;
    
    console.log(`📊 Quiz breakdown:`);
    console.log(`  - Mountix questions: ${mountixCount}`);
    console.log(`  - Gemini questions: ${geminiCount}\n`);
    
    // 各クイズのタイプを表示
    console.log('Question types:');
    questions.forEach((q, i) => {
      console.log(`  ${i + 1}. [${q.type}] ${q.prompt.substring(0, 50)}...`);
    });
    
    console.log('\n✅ Mixed quiz generation successful!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMixedQuiz();
