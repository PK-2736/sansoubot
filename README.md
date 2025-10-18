# Welcome to GitHub Desktop!

This is your README. READMEs are where you can communicate what your project is and how to use it.

Write your name on line 6, save it, and then head back to GitHub Desktop.

完璧です！🎉
では、あなたが構想している「登山情報・天気・地図・クイズ統合Discord Bot」を
TypeScript + discord.js + Supabase 構成で実装する場合の
**開発ロードマップ＆フォルダ構成＋使用ライブラリ一覧** をまとめます👇

---

# 🏔 Discord 登山Bot 開発ドキュメント（原型）

## 🌲 プロジェクト概要

**登山愛好家向け Discord Bot**
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
   npm install discord.js axios dotenv supabase-js node-cron
   npm install -D typescript ts-node prisma
   npx prisma init
   ```

2. **Discord Botトークン設定**

   * `.env` に以下を追加：

     ```
     DISCORD_TOKEN=xxxx
     SUPABASE_URL=xxxx
     SUPABASE_KEY=xxxx
     ```

3. **基本コマンド（/ping /help）実装**

4. **Mountix API & JMA API連携**

5. **ユーザー投稿山DB構築**

6. **地図生成（Leaflet or StaticMap API）**

7. **クイズ機能 + ランキング**

8. **Render または Cloudflare Workers にデプロイ**

---

## 🌐 将来的な拡張案

* 山行記録（ヤマレコAPIとの連携）
* AIによる山写真の自動認識クイズ
* 複数サーバー間でのランキング共有
* 山警報の自動通知

---

必要であれば、
次はこの構成に沿った **実際のBot起動テンプレート（index.ts + コマンド例）** を書けます。
続けてそれも出しましょうか？
