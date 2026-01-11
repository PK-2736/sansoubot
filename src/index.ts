import 'dotenv/config';
import { Client, GatewayIntentBits, ApplicationCommandOptionType } from 'discord.js';
import ready from './events/ready';
import interactionCreate from './events/interactionCreate';
import { log } from './utils/logger';
import guildCreate from './events/guildCreate';

// コマンドの取り込み
import ping from './commands/ping';
import help from './commands/help';
import mountainAdd from './commands/mountain/add';
import mountainSearch from './commands/mountain/search';
import weatherForecast from './commands/weather/forecast';
import mapRoute from './commands/map/route';
import quizStart from './commands/quiz/start';
import quizRank from './commands/quiz/rank';
import adminApprove from './commands/admin/approve';

// 登録用のメタ情報（説明付き + オプション）
const commandsForRegistration = [
  { name: ping.data.name, description: '疎通確認（Pong を返します）' },
  { name: help.data.name, description: 'Botのコマンド一覧を表示' },
  // mountain_info は mountain_search に統合されました（詳細は mountain_search の `id` オプションを使用してください）
  {
    name: mountainAdd.data.name,
    description: 'ユーザー投稿で山を追加（承認制）',
  },
  {
    name: mountainSearch.data.name,
    description: '山を検索',
    options: [
      { name: 'name', description: '山名で検索（部分一致）', type: ApplicationCommandOptionType.String, required: false },
  // limit オプションは削除されました
    ],
  },
  // weather_forecast と map_route は未完成のため非表示
  // {
  //   name: weatherForecast.data.name,
  //   description: '山域の天気予報を表示',
  //   options: [
  // { name: 'lat', description: '緯度（例: 35.68）', type: ApplicationCommandOptionType.String, required: false },
  // { name: 'lon', description: '経度（例: 139.76）', type: ApplicationCommandOptionType.String, required: false },
  // { name: 'mountain', description: '山名または Mountix ID（例: 富士山, 1234）', type: ApplicationCommandOptionType.String, required: false },
  //   ],
  // },
  // {
  //   name: mapRoute.data.name,
  //   description: 'Static Mapなどでルート画像を生成',
  //   options: [
  //     { name: 'markers', description: '複数地点（;区切り）例: "lat,lon;lat2,lon2"', type: ApplicationCommandOptionType.String, required: false },
  //     { name: 'path', description: 'ルート座標（;区切り）例: "lat,lon;lat2,lon2"', type: ApplicationCommandOptionType.String, required: false },
  //     { name: 'zoom', description: 'ズームレベル（数値）', type: ApplicationCommandOptionType.String, required: false },
  //     { name: 'size', description: '画像サイズ（例: 800x600）', type: ApplicationCommandOptionType.String, required: false },
  //     { name: 'gpx', description: 'GPXファイルを添付（ファイル）', type: ApplicationCommandOptionType.Attachment, required: false },
  //   ],
  // },
  { name: quizStart.data.name, description: '山クイズを開始' },
  { name: quizRank.data.name, description: 'クイズのランキングを表示' },
  { name: adminApprove.data.name, description: 'ユーザー投稿山の承認（管理者用）' },
];

// 実行用マップ
const commandMap: Record<string, (i: any) => Promise<void>> = {
  [ping.data.name]: ping.execute,
  [help.data.name]: help.execute,
  [mountainAdd.data.name]: mountainAdd.execute,
  [mountainSearch.data.name]: mountainSearch.execute,
  [weatherForecast.data.name]: weatherForecast.execute,
  [mapRoute.data.name]: mapRoute.execute,
  [quizStart.data.name]: quizStart.execute,
  [quizRank.data.name]: quizRank.execute,
  [adminApprove.data.name]: adminApprove.execute,
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', ready(commandsForRegistration));
client.on('interactionCreate', interactionCreate(commandMap));
client.on('guildCreate', guildCreate(commandsForRegistration));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  log('Failed to login:', err);
});

// グローバルエラーハンドラ: キャッチされない例外 / 未処理の Promise 拒否を捕捉します
process.on('unhandledRejection', (reason) => {
  log('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  log('UNCAUGHT EXCEPTION:', err);
  // 必要であればログ記録後にプロセスを終了することも可能です
});
