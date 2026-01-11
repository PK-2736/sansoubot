import { ChatInputCommandInteraction } from 'discord.js';
import { formatEmbed } from '../utils/format';

export default {
  data: { name: 'help' },
  async execute(interaction: ChatInputCommandInteraction) {
    const description =
      [
        '**基本コマンド**',
        '/ping - 疎通確認',
        '/help - このヘルプを表示',
        '',
        '**山情報**',
        '/mountain_search - 山を検索（個別情報も表示）',
        '/mountain_add - ユーザー投稿で山を申請（承認制）',
        '',
        '**クイズ**',
        '/quiz_start - 山クイズ開始（10問）',
        '/quiz_rank - クイズランキング表示',
        '',
        '**その他**',
        '/report - botの不具合を報告',
        '/admin_approve - 管理者用：投稿山の承認',
      ].join('\n');

    await interaction.reply({
      embeds: [formatEmbed('📚 コマンド一覧', description) as any],
      ephemeral: true,
    });
  },
};
