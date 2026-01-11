
import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildQuiz } from '../../utils/quiz';
import safeReply from '../../utils/discord';
import { log } from '../../utils/logger';

export default {
  data: { name: 'quiz_start' },
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const EPHEMERAL = (await import('../../utils/flags')).EPHEMERAL;
      await interaction.deferReply({ flags: EPHEMERAL });
      const questions = await buildQuiz();
      // 開始用Embed
      const eb = new EmbedBuilder()
        .setTitle('山クイズ')
        .setDescription(`全${questions.length}問の山クイズを開始できます！\n\n・ボタンでスタート\n・終了後に全問の正答も表示されます`)
        .setColor(0x4caf50)
        .setFooter({ text: 'Powered by Mountix & Gemini AI' });
      const startButton = new ButtonBuilder().setCustomId('quiz:start').setLabel('開始').setStyle(ButtonStyle.Success);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton);
      await safeReply(interaction, { embeds: [eb], components: [row] });
    } catch (e: any) {
      log('quiz_start error', String(e?.message ?? e));
  try { await interaction.reply({ content: 'クイズの作成に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL }); } catch (_) {}
    }
  },
};
