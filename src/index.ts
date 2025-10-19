import 'dotenv/config';
import { Client, GatewayIntentBits, ApplicationCommandOptionType } from 'discord.js';
import ready from './events/ready';
import interactionCreate from './events/interactionCreate';
import { log } from './utils/logger';

// コマンドの取り込み
import ping from './commands/ping';
import help from './commands/help';
import mountainInfo from './commands/mountain/info';
import mountainAdd from './commands/mountain/add';
import mountainSearch from './commands/mountain/search';
import weatherForecast from './commands/weather/forecast';
import mapRoute from './commands/map/route';
import quizStart from './commands/quiz/start';
import quizAnswer from './commands/quiz/answer';
import adminApprove from './commands/admin/approve';

// 登録用のメタ情報（説明付き + オプション）
const commandsForRegistration = [
  { name: ping.data.name, description: '疎通確認（Pong を返します）' },
  { name: help.data.name, description: 'Botのコマンド一覧を表示' },
  {
    name: mountainInfo.data.name,
    description: '山の情報を表示（Mountixなどと連携予定）',
    options: [
      { name: 'id', description: 'Mountix の山ID（未指定時は例示）', type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  {
    name: mountainAdd.data.name,
    description: 'ユーザー投稿で山を追加（承認制）',
    options: [
      { name: 'name', description: '山名', type: ApplicationCommandOptionType.String, required: true },
      { name: 'elevation', description: '標高（m）', type: ApplicationCommandOptionType.String, required: false },
      { name: 'location', description: '場所', type: ApplicationCommandOptionType.String, required: false },
      { name: 'description', description: '説明', type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  {
    name: mountainSearch.data.name,
    description: '山を検索',
    options: [
      { name: 'q', description: '検索ワード（旧: 山名、非推奨）', type: ApplicationCommandOptionType.String, required: false },
      { name: 'name', description: '山名で検索（部分一致）', type: ApplicationCommandOptionType.String, required: false },
      { name: 'limit', description: '取得件数', type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  {
    name: weatherForecast.data.name,
    description: '山域の天気予報を表示',
    options: [
      { name: 'area', description: 'JMA 地域コードまたは地域名', type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  {
    name: mapRoute.data.name,
    description: 'Static Mapなどでルート画像を生成',
    options: [
      { name: 'lat', description: '緯度（例: 35.68）', type: ApplicationCommandOptionType.String, required: false },
      { name: 'lon', description: '経度（例: 139.76）', type: ApplicationCommandOptionType.String, required: false },
    ],
  },
  { name: quizStart.data.name, description: '山クイズを開始' },
  { name: quizAnswer.data.name, description: 'クイズへの回答' },
  { name: adminApprove.data.name, description: 'ユーザー投稿山の承認（管理者用）' },
];

// 実行用マップ
const commandMap: Record<string, (i: any) => Promise<void>> = {
  [ping.data.name]: ping.execute,
  [help.data.name]: help.execute,
  [mountainInfo.data.name]: mountainInfo.execute,
  [mountainAdd.data.name]: mountainAdd.execute,
  [mountainSearch.data.name]: mountainSearch.execute,
  [weatherForecast.data.name]: weatherForecast.execute,
  [mapRoute.data.name]: mapRoute.execute,
  [quizStart.data.name]: quizStart.execute,
  [quizAnswer.data.name]: quizAnswer.execute,
  [adminApprove.data.name]: adminApprove.execute,
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', ready(commandsForRegistration));
client.on('interactionCreate', interactionCreate(commandMap));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  log('Failed to login:', err);
});

// Global error handlers to capture uncaught exceptions / unhandled rejections
process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err);
  // optionally exit process after logging
});
