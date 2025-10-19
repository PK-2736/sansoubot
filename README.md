
---

# 🏔 Discord 登山Bot 開発ドキュメント（原型）

## 🌲 プロジェクト概要

**Discord山荘 Bot**
山の情報・天気・ルート・クイズを通して、サーバーメンバー同士の交流を活発にするためのBot。

---

## 🧩 主な機能

| 機能            | 内容                       | 利用サービス/API                 |
| ------------- | ------------------------ | -------------------------- |
| 🏔 山情報取得      | Mountix API + ユーザー登録山データ | Mountix API / Supabase     |
| ☁️ 天気情報       | 山域の天気予報・警報取得             | JMA Open Data API          |
| 🗺 地図／ルート表示   | OSM + GSI から静的地図生成       | Leaflet / Static Map API   |
| 🧗‍♂️ ユーザー投稿山 | 独自DBで管理・承認制              | Supabase                   |
| ❓ クイズ機能       | 山の豆知識・写真クイズ              | Supabase（問題管理）             |
| 🔔 通知機能       | 天気警報や新しい山追加などを通知         | Discord Webhook / cron-job |

---

## 🧱 技術スタック

| 分類          | 技術                                      | 補足                                     |
| ----------- | --------------------------------------- | -------------------------------------- |
| 言語          | **TypeScript (Node.js)**                | 開発効率・型安全性が高い                           |
| Discord SDK | **discord.js v14**                      | 最新の Slash Command / Button / Embed に対応 |
| API通信       | axios / node-fetch                      | JMA・MountixなどREST連携用                   |
| DB          | **Supabase (PostgreSQL)**               | ユーザー投稿・クイズ・ランキング管理                     |
| ORM         | Prisma                                  | 型安全なDB操作をサポート                          |
| 地図          | leaflet + leaflet-image / StaticMap API | GSIやOSMの地図描画                           |
| スケジューラー     | node-cron                               | 定期天気通知など                               |
| 環境変数管理      | dotenv                                  | APIキー管理                                |
| デプロイ        | Render / Railway / Cloudflare Workers   | 無料枠あり・常時稼働可能                           |

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

## 🧮 Supabase（DB）スキーマ例

### 🏔 user_mountains

| カラム名        | 型         | 説明            |
| ----------- | --------- | ------------- |
| id          | uuid      | 主キー           |
| name        | text      | 山名            |
| elevation   | int       | 標高            |
| location    | text      | 所在地           |
| description | text      | 概要            |
| route       | text      | 登山ルート         |
| photo_url   | text      | 写真URL         |
| added_by    | text      | DiscordユーザーID |
| approved    | boolean   | 承認済みか         |
| created_at  | timestamp | 登録日時          |

### 🧠 quiz_questions

| カラム       | 型    | 内容        |
| --------- | ---- | --------- |
| id        | uuid | 主キー       |
| question  | text | 問題文       |
| options   | json | 選択肢       |
| answer    | text | 正解        |
| image_url | text | （任意）写真URL |

---

## 🚀 今後の開発ステップ

1. **プロジェクト初期化**

   ```bash
   npm init -y
   npm install discord.js axios dotenv @supabase/supabase-js @prisma/client node-cron
   npm install -D typescript ts-node prisma @types/node
   npx tsc --init
   npx prisma init
   ```

2. **Discord Botトークン設定**

   * `.env.example` を `.env` にコピーして以下を設定：

     ```
     DISCORD_TOKEN=your_actual_discord_bot_token
     SUPABASE_URL=your_supabase_project_url
     SUPABASE_KEY=your_supabase_anon_key
     DATABASE_URL=postgresql://user:password@host:5432/dbname
     ```

3. **動作確認手順**

   ```bash
   # 依存関係をインストール
   npm install

   # TypeScriptコンパイル確認
   npm run build

   # 開発モードで起動（ts-node）
   npm run dev
   ```

   起動後、Discordサーバーで `/ping` コマンドを実行して「Pong!」が返ってくれば成功です。

4. **基本コマンド（/ping /help）実装** ✅

5. **Mountix API & JMA API連携**

6. **ユーザー投稿山DB構築**

7. **地図生成（Leaflet or StaticMap API）**

8. **クイズ機能 + ランキング**

9. **Render または Cloudflare Workers にデプロイ**

---

## 🌐 将来的な拡張案

* 山行記録（ヤマレコAPIとの連携）
* AIによる山写真の自動認識クイズ
* 複数サーバー間でのランキング共有
* 山警報の自動通知

---

## 🛠 OCI (ARM Ubuntu) でのデプロイ手順（要点）

注意（最重要）
- 既にトークンを公開している状態なので、DISCORD_TOKEN は即時無効化して再発行してください。新しいトークンは .env にのみ保管し、公開リポジトリに置かないでください。

簡易手順（実運用向け）
1. サーバ準備（ARM Ubuntu）
   - SSH でログインし、必要パッケージをインストール :
     ```bash
     sudo apt update
     sudo apt install -y build-essential curl git
     ```
   - nvm を使って Node.js を入れる（推奨: Node 18+）
     ```bash
     curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
     source ~/.profile
     nvm install 18
     node -v
     ```

2. リポジトリ取得・環境変数設定
   ```bash
   git clone <repo-url> ~/mountain-bot
   cd ~/mountain-bot
   cp .env.example .env
   # .env を編集して DISCORD_TOKEN, DATABASE_URL, SUPABASE_* 等を設定
   ```

3. 依存関係インストール・Prisma 準備
   ```bash
   npm ci
   npx prisma generate
   # 開発時:
   npx prisma migrate dev --name init
   # 本番環境でマイグレーションを適用する場合:
   npx prisma migrate deploy
   ```

4. ビルド & 起動（systemd の例）
   - ビルド :
     ```bash
     npm run build
     ```
   - systemd サービス（例）: /etc/systemd/system/mountain-bot.service
     ```ini
     [Unit]
     Description=mountain-bot
     After=network.target

     [Service]
     Type=simple
     User=ubuntu
     WorkingDirectory=/home/ubuntu/mountain-bot
     Environment=NODE_ENV=production
     EnvironmentFile=/home/ubuntu/mountain-bot/.env
     ExecStart=/home/ubuntu/.nvm/versions/node/v18.x/bin/node dist/index.js
     Restart=always
     RestartSec=5
     StandardOutput=syslog
     StandardError=syslog
     SyslogIdentifier=mountain-bot

     [Install]
     WantedBy=multi-user.target
     ```
     有効化・起動 :
     ```bash
     sudo systemctl daemon-reload
     sudo systemctl enable --now mountain-bot
     sudo journalctl -u mountain-bot -f
     ```

   - 代替: PM2 を使う場合
     ```bash
     npm install -g pm2
     pm2 start dist/index.js --name mountain-bot --env production
     pm2 save
     pm2 startup
     ```

5. Docker（ARM）での運用案（任意）
   - ベースイメージは multiarch を意識して node:18-bullseye-slim などを使用。
   - ビルド（サーバ側で直接）:
     ```bash
     docker build -t mountain-bot:latest .
     docker run -d --env-file .env --name mountain-bot --restart unless-stopped mountain-bot:latest
     ```
   - ローカルでビルドして ARM にプッシュする場合は `--platform linux/arm64` を指定。

運用メモ（短く）
- ログは journalctl / PM2 で監視。ログローテートや Sentry 等の監視導入を検討してください。
- DB接続情報（DATABASE_URL）は必須。Supabase と Prisma を併用する場合は主にどちらをデータソースにするか方針を決めてください。
- 常時稼働にあたっては自動再起動、メモリ監視、セキュリティ更新（OS パッチ）を定期的に実施してください。
