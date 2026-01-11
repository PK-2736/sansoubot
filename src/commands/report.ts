import { ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { log } from '../utils/logger';

export default {
  data: { name: 'report' },
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // モーダルを作成
      const modal = new ModalBuilder()
        .setCustomId('report_modal')
        .setTitle('不具合報告');

      const titleInput = new TextInputBuilder()
        .setCustomId('report_title')
        .setLabel('タイトル（簡潔に）')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('例：クイズが開始されない')
        .setRequired(true)
        .setMaxLength(100);

      const detailsInput = new TextInputBuilder()
        .setCustomId('report_details')
        .setLabel('詳細な説明')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('発生した現象、どうしたいのかを記入してください')
        .setRequired(true)
        .setMaxLength(1000);

      const stepsInput = new TextInputBuilder()
        .setCustomId('report_steps')
        .setLabel('再現手順（任意）')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('1. ～\n2. ～\n3. ～')
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(detailsInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(stepsInput)
      );

      await interaction.showModal(modal);
      log(`[Report] Modal shown to user ${interaction.user.id}`);
    } catch (e: any) {
      log('[Report] Error showing modal:', e?.message ?? e);
      try {
        await interaction.reply({ content: '報告フォームの表示に失敗しました。', flags: (await import('../utils/flags')).EPHEMERAL });
      } catch (_) {}
    }
  },
};
