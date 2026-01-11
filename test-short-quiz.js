require('dotenv').config();
const { generateGeminiQuizQuestions } = require('./dist/utils/geminiQuiz');

generateGeminiQuizQuestions(2).then(questions => {
  console.log('Generated questions:\n');
  questions.forEach((quiz, i) => {
    console.log(`${i+1}. ${quiz.question}`);
    console.log(`   問題文の長さ: ${quiz.question.length}文字`);
    quiz.options.forEach((opt, j) => {
      console.log(`   ${j+1}) ${opt} (${opt.length}文字)`);
    });
    console.log('');
  });
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
