import { ChatInputCommandInteraction } from 'discord.js';
import { formatEmbed } from '../utils/format';

export default {
  data: { name: 'help' },
  async execute(interaction: ChatInputCommandInteraction) {
    const description =
      [
        '/ping - 疎通確認',
        '/help - このヘルプを表示',
        '/mountain_info - 山の情報を表示（Mountix連携予定）',
        '/mountain_add - ユーザー投稿で山を申請（承認制）',
        '/mountain_search - 山を検索',
        '/weather_forecast - 山域の天気予報',
        '/map_route - ルート画像を生成（静的地図）',
        '/quiz_start - クイズ開始',
        '/quiz_answer - クイズ回答',
        '/admin_approve - 管理者承認',
      ].join('\n');

    await interaction.reply({
      embeds: [formatEmbed('ヘルプ', description) as any],
      ephemeral: true,
    });
  },
};
