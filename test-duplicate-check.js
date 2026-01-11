require('dotenv').config();
const { generateGeminiQuizQuestions } = require('./dist/utils/geminiQuiz');

console.log('Testing Gemini quiz generation with duplicate prevention...\n');

generateGeminiQuizQuestions(5).then(questions => {
  console.log(`✅ Generated ${questions.length} valid questions\n`);
  
  questions.forEach((quiz, i) => {
    console.log(`${i+1}. ${quiz.question} (${quiz.question.length}文字)`);
    
    // 重複チェック
    const uniqueOptions = new Set(quiz.options);
    const hasDuplicates = uniqueOptions.size !== quiz.options.length;
    
    quiz.options.forEach((opt, j) => {
      const isAnswer = opt === quiz.answer;
      console.log(`   ${j+1}) ${opt} (${opt.length}文字)${isAnswer ? ' ✓正解' : ''}`);
    });
    
    if (hasDuplicates) {
      console.log(`   ⚠️ WARNING: 重複する選択肢があります！`);
    } else {
      console.log(`   ✓ すべての選択肢が異なります`);
    }
    console.log('');
  });
  
  process.exit(0);
}).catch(e => {
  console.error('❌ Error:', e);
  process.exit(1);
});
