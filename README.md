
---

# 🏔 Discord山荘Bot 開発ドキュメント

## 🧳 内部保存（SQLite）への移行について

このリポジトリは、Supabase（PostgreSQL）での保存から、軽量な内部保存（Prisma + SQLite）に移行しました。データは `prisma/dev.db` に保存されます。

### セットアップ手順

1. **依存関係のインストール**
   ```bash
   npm install
   ```

2. **環境変数の設定**
   - `.env.example` をコピーして `.env` を作成
   ```bash
   cp .env.example .env
   ```
   - `.env` ファイルに必要なAPIキーを設定:
     - `DISCORD_TOKEN`: Discord Bot Token（[Discord Developer Portal](https://discord.com/developers/applications)）
     - `GEMINI_API_KEY`: Gemini API Key（[Google AI Studio](https://makersuite.google.com/app/apikey)） ※クイズ生成機能を使う場合のみ

3. **Prismaのセットアップ**
   ```bash
   npm run prisma:generate
   npx prisma db push
   ```

4. **ビルドと実行**
   ```bash
   npm run build
   npm start
   ```

クイズのスコアは `QuizScore` テーブル、ユーザー追加の山は `UserMountain` テーブルに保存されます。検索・承認・ランキングはすべて内部DBを使用します。

**⚠️ 注意**: `.env` ファイルには機密情報が含まれるため、Gitにコミットしないでください（.gitignoreに含まれています）。

## 🌲 プロジェクト概要

**Discord山荘 Bot**
山の情報・天気・ルート・クイズを通して、サーバーメンバー同士の交流を活発にするためのBotです。

---

## 🧩 主な機能

| 機能            | 内容                       | 利用サービス/API                 |
| ------------- | ------------------------ | -------------------------- |
| 🏔 山情報取得      | Mountix API + ユーザー登録山データ + Wikipedia画像情報 | Mountix API / Wikipedia API / Prisma (SQLite)     |
| ☁️ 天気情報       | 山域の天気予報・警報取得             | JMA Open Data API          |
| 🗺 地図／ルート表示   | OSM + GSI から静的地図生成       | Leaflet / Static Map API   |
| 🧗‍♂️ ユーザー投稿山 | 独自DBで管理・承認制              | Prisma (SQLite)                   |
| ❓ クイズ機能       | **AI生成クイズ + Mountix山データクイズ（Mountix 3問 + Gemini AI 7問）**              | Gemini API / Mountix API / Prisma (SQLite)             |
| 🔔 通知機能       | 天気警報や新しい山追加などを通知         | Discord Webhook / cron-job |

---

## 🧱 技術スタック

| 分類          | 技術                                      | 補足                                     |
| ----------- | --------------------------------------- | -------------------------------------- |
| 言語          | **TypeScript (Node.js)**                | 開発効率・型安全性ヨシ。                           |
| Discord SDK | **discord.js v14**                      | 最新の Slash Command / Button / Embed に対応 |
| API通信       | axios / node-fetch                      | JMA・MountixなどREST連携用                   |
| DB          | **Prisma + SQLite**                     | ユーザー投稿・クイズ・ランキング管理（ローカル保存）         |
| ORM         | Prisma                                  | 型安全なDB操作をサポート                          |
| 地図          | leaflet + leaflet-image / StaticMap API | GSIやOSMの地図描画                           |
| スケジューラー     | node-cron                               | 定期天気通知など                               |
| 環境変数管理      | dotenv                                  | APIキー管理                                |
| デプロイ        | OCI VPS A1 ampere   | 常時稼働                          |

---

## 📂 フォルダ構成（推奨）

```
mountain-bot/
├── src/
│   ├── commands/
│   │   ├── mountain/
│   │   │   ├── info.ts        # 山情報取得コマンド
│   │   │   ├── add.ts         # ユーザー投稿
│   │   │   └── search.ts      # 山検索
│   │   ├── weather/
│   │   │   └── forecast.ts    # 天気情報取得
│   │   ├── map/
│   │   │   └── route.ts       # 地図・ルート生成
│   │   ├── quiz/
│   │   │   ├── start.ts       # クイズ開始
│   │   │   └── answer.ts      # 回答処理
│   │   └── admin/
│   │       └── approve.ts     # 山データ承認コマンド
│   │
│   ├── utils/
│   │   ├── api/
│   │   │   ├── mountix.ts     # Mountix APIクライアント
│   │   │   ├── jma.ts         # JMA天気APIクライアント
│   │   │   └── map.ts         # 地図生成ユーティリティ
│   │   ├── db.ts              # Supabase接続
│   │   ├── logger.ts          # ログ出力
│   │   └── format.ts          # Embed整形など
│   │
│   ├── events/
│   │   ├── ready.ts           # Bot起動時イベント
│   │   └── interactionCreate.ts # コマンド応答
│   │
│   ├── scheduler/
│   │   └── weatherAlert.ts    # 定期天気通知
│   │
│   └── index.ts               # メインエントリ
│
├── prisma/
│   └── schema.prisma          # DBスキーマ
│
├── .env                       # APIキー類
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🧮 Prisma（DB）スキーマ

### 🏔 UserMountain

| カラム名        | 型         | 説明            |
| ----------- | --------- | ------------- |
| id          | String (UUID)      | 主キー           |
| name        | String      | 山名            |
| elevation   | Int       | 標高            |
| location    | String      | 所在地           |
| description | String?      | 概要（任意）            |
| route       | String?      | 登山ルート（任意）         |
| photo_url   | String?      | 写真URL（任意）         |
| added_by    | String      | DiscordユーザーID |
| approved    | Boolean   | 承認済みか（デフォルト: false）         |
| created_at  | DateTime | 登録日時（自動設定）          |

### 🧠 QuizQuestion

| カラム       | 型    | 内容        |
| --------- | ---- | --------- |
| id        | String (UUID) | 主キー       |
| question  | String | 問題文       |
| options   | String (JSON) | 選択肢       |
| answer    | String | 正解        |
| image_url | String? | （任意）写真URL |
| source | String | クイズソース（mountix / gemini）デフォルト: mountix |
| created_at | DateTime | 作成日時（自動設定） |

### 📊 QuizScore

| カラム       | 型    | 内容        |
| --------- | ---- | --------- |
| id        | String (UUID) | 主キー       |
| user_id  | String | DiscordユーザーID       |
| username   | String | Discordユーザー名       |
| score    | Int | スコア        |
| time_ms | Int | 完了時間（ミリ秒） |
| created_at | DateTime | 記録日時（自動設定） |

---
---

## 🌐 将来的な拡張案

* 山行記録（ヤマレコAPIとの連携）
* より高度なAIクイズ生成（画像認識を含む）
* ユーザー別クイズ難易度調整

---

## 🤖 Gemini AI クイズ生成について

このBotは、登山クイズの生成にGoogle Gemini APIを活用しています：

- **混合クイズ構成**: Mountix API（山データ）から3問 + Gemini AI生成7問 = 計10問
- **クイズの保存**: Gemini生成クイズはDBに保存され、再利用されます（API呼び出し削減）
- **重複防止**: 同じ問題文のクイズは自動的にスキップされます
- **モデル**: `gemini-2.5-flash`（無料枠で1日1500リクエストまで利用可能）

### Gemini API Keyの取得と設定

1. **API Keyの取得**
   - [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
   - Googleアカウントでログイン
   - 「Create API Key」をクリックしてAPIキーを生成

2. **環境変数に設定**
   ```bash
   # .envファイルに以下を追加
   GEMINI_API_KEY=your_generated_api_key_here
   ```

3. **注意事項**
   - APIキーは`.env`ファイルに保存し、**絶対にGitにコミットしないでください**
   - 無料枠: 1日1500リクエスト、1分15リクエスト
   - クイズはDBに保存されるため、同じ問題は再生成されません（効率的）

---

## 🔒 データベース保護（本番環境）

### OCIサーバー上でのデータ保護手順

サーバー上の `prisma/dev.db` はユーザーデータを含む重要なファイルです。`git pull` で上書きされないよう、以下の手順を実行してください：

```bash
# 1. サーバーにSSH接続後、プロジェクトディレクトリへ移動
cd ~/sansoubot

# 2. データベースをバックアップ（念のため）
cp prisma/dev.db prisma/dev.db.backup.$(date +%Y%m%d_%H%M%S)

# 3. Git追跡からdev.dbを除外
git rm --cached prisma/dev.db

# 4. 変更をコミット
git commit -m "Remove dev.db from git tracking"

# 5. これで安全にpullできます
git pull origin main
```

### 自動バックアップスクリプト

定期的なバックアップには `backup-db.sh` スクリプトを使用してください：

```bash
# スクリプトを実行
./backup-db.sh

# cronで自動化する場合（毎日深夜2時に実行）
crontab -e
# 以下を追加
0 2 * * * cd ~/sansoubot && ./backup-db.sh >> ~/sansoubot_backup.log 2>&1
```

バックアップは `~/sansoubot_backups/` に保存され、30日以上前のものは自動削除されます。

---
