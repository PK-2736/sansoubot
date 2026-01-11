// Gemini利用可能モデルを確認
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not set in .env');
    return;
  }
  
  console.log('API Key:', GEMINI_API_KEY.substring(0, 10) + '...');
  console.log('\nFetching available models...\n');
  
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  try {
    // Try different model names
    const modelNames = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'models/gemini-pro',
      'models/gemini-1.5-pro',
      'models/gemini-1.5-flash'
    ];
    
    for (const modelName of modelNames) {
      try {
        console.log(`Testing model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say hello');
        const response = result.response;
        const text = response.text();
        console.log(`✓ ${modelName} works! Response: ${text.substring(0, 50)}...\n`);
        break; // 動作したら終了
      } catch (error) {
        console.log(`✗ ${modelName} failed: ${error.message}\n`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

listModels();
