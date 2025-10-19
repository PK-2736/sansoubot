import { ChatInputCommandInteraction } from 'discord.js';
import { supabase } from '../../utils/db';
import { formatEmbed } from '../../utils/format';

export default {
  data: { name: 'quiz_rank' },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    try {
      if (!supabase) {
        await interaction.editReply('データベース未接続です。');
        return;
      }
      const { data } = await supabase.from('quiz_scores').select('*').order('score', { ascending: false }).limit(10);
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
