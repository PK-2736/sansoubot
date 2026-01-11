import { ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../utils/db';
import { formatEmbed } from '../../utils/format';

export default {
  data: { name: 'quiz_rank' },
  async execute(interaction: ChatInputCommandInteraction) {
    const EPHEMERAL = (await import('../../utils/flags')).EPHEMERAL;
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const data = await prisma.quizScore.findMany({ orderBy: [{ score: 'desc' }, { time_ms: 'asc' }], take: 10 });
      if (!data || data.length === 0) {
        await interaction.editReply('ランキングデータがありません。');
        return;
      }
  const lines = (data as any[]).map((r, i) => `${i + 1}. ${r.username} — ${r.score} pts — ${Math.round((r.time_ms||0)/1000)}s`);
  const codeBlock = '```\n' + lines.join('\n') + '\n```';
  const eb = formatEmbed('Quiz Ranking', codeBlock);
  await interaction.editReply({ embeds: [eb] });
    } catch (e) {
      await interaction.editReply('ランキングの取得に失敗しました。');
    }
  },
};
