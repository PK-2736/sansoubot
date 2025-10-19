
---

# 🏔 Discord山荘Bot 開発ドキュメント

## 🌲 プロジェクト概要

**Discord山荘 Bot**
山の情報・天気・ルート・クイズを通して、サーバーメンバー同士の交流を活発にするためのBotです。

---

## 🧩 主な機能

| 機能            | 内容                       | 利用サービス/API                 |
| ------------- | ------------------------ | -------------------------- |
| 🏔 山情報取得      | Mountix API + ユーザー登録山データ + wiki情報 | Mountix API / Supabase     |
| ☁️ 天気情報       | 山域の天気予報・警報取得             | JMA Open Data API          |
| 🗺 地図／ルート表示   | OSM + GSI から静的地図生成       | Leaflet / Static Map API   |
| 🧗‍♂️ ユーザー投稿山 | 独自DBで管理・承認制              | Supabase                   |
| ❓ クイズ機能       | 山の豆知識クイズ              | Supabase（問題管理）             |
| 🔔 通知機能       | 天気警報や新しい山追加などを通知         | Discord Webhook / cron-job |

---

## 🧱 技術スタック

| 分類          | 技術                                      | 補足                                     |
| ----------- | --------------------------------------- | -------------------------------------- |
| 言語          | **TypeScript (Node.js)**                | 開発効率・型安全性ヨシ。                           |
| Discord SDK | **discord.js v14**                      | 最新の Slash Command / Button / Embed に対応 |
| API通信       | axios / node-fetch                      | JMA・MountixなどREST連携用                   |
| DB          | **Supabase (PostgreSQL)**               | ユーザー投稿・クイズ・ランキング管理                     |
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
---

## 🌐 将来的な拡張案

* 山行記録（ヤマレコAPIとの連携）
* AIによる山写真の自動認識クイズ

---
