require('dotenv').config();
const { buildQuiz } = require('./dist/utils/quiz');

console.log('Testing mixed quiz generation with detailed logging...\n');
console.log('Environment check:');
console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? 'SET (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'NOT SET'}`);
console.log('');

buildQuiz().then(questions => {
  console.log(`\n✅ Quiz generation completed!`);
  console.log(`Total questions: ${questions.length}`);
  
  const mountixCount = questions.filter(q => q.type !== 'gemini').length;
  const geminiCount = questions.filter(q => q.type === 'gemini').length;
  
  console.log(`  - Mountix: ${mountixCount}`);
  console.log(`  - Gemini: ${geminiCount}`);
  
  if (geminiCount === 0) {
    console.log('\n⚠️  WARNING: No Gemini questions were generated!');
    console.log('Check the logs above for errors.');
  }
  
  process.exit(0);
}).catch(e => {
  console.error('\n❌ Quiz generation failed:', e);
  process.exit(1);
});
