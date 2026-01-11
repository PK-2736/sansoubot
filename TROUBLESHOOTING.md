# Geminiクイズが生成されない場合のトラブルシューティング

## 症状
- クイズが3問しか生成されない（Mountixのみ）
- Geminiクイズが表示されない

## 確認手順

### 1. 環境変数の確認
```bash
# .envファイルにGEMINI_API_KEYが設定されているか確認
cat .env | grep GEMINI_API_KEY

# 実行時に環境変数が読み込まれているか確認
node -e "require('dotenv').config(); console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET')"
```

### 2. ログの確認
PM2で実行している場合：
```bash
# ログを表示
pm2 logs mountain-bot --lines 100

# 以下のようなエラーログがないか確認
# [GeminiQuiz] API key not set, skipping generation
# [GeminiQuiz] Error generating questions
# [QuizBuilder] WARNING: No Gemini questions generated
```

### 3. テスト実行
```bash
# ビルド
npm run build

# Gemini単体テスト
node -e "require('dotenv').config(); const { generateGeminiQuizQuestions } = require('./dist/utils/geminiQuiz'); generateGeminiQuizQuestions(2).then(q => console.log('Success:', q.length, 'questions')).catch(e => console.error('Error:', e.message))"

# 混合クイズテスト
node test-quiz-debug.js
```

### 4. よくある原因と対処法

#### API Keyが設定されていない
```bash
# .envファイルを確認・編集
nano .env

# 以下を追加（実際のキーに置き換え）
GEMINI_API_KEY=your_actual_api_key_here
```

#### PM2が古い.envを読み込んでいる
```bash
# PM2を再起動して環境変数を再読み込み
pm2 restart mountain-bot
```

#### APIクォータ超過
- Gemini APIの無料枠：1日1500リクエスト
- ログに429エラーが出ている場合は翌日まで待つ

#### ネットワークエラー
```bash
# Gemini APIへの接続をテスト
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY" | head -20
```

### 5. デバッグモードでの実行
```bash
# ログレベルを上げて実行
NODE_ENV=development npm start

# または
pm2 start ecosystem.config.js --env development
```

## 正常時のログ例
```
[QuizBuilder] Building mixed quiz (3 Mountix + 7 Gemini)...
[QuizBuilder] Generating 7 new Gemini quizzes...
[GeminiQuiz] Generating 7 questions...
[GeminiQuiz] Successfully parsed 7 questions from JSON
[GeminiQuiz] Successfully generated 7/7 valid questions
[QuizBuilder] Generated 3 Mountix, 7 Gemini questions
[QuizBuilder] Final quiz: 10 questions (3 Mountix + 7 Gemini)
```

## エラー時のログ例
```
[GeminiQuiz] API key not set, skipping generation
[QuizBuilder] Gemini API returned 0 quizzes
[QuizBuilder] WARNING: No Gemini questions generated.
[QuizBuilder] Generated 3 Mountix, 0 Gemini questions
```
