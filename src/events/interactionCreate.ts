import { Interaction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { log } from '../utils/logger';

type CommandExecute = (interaction: ChatInputCommandInteraction) => Promise<any>;
type CommandMap = Record<string, CommandExecute>;

export default function createInteractionHandler(commands: CommandMap) {
  return async (interaction: Interaction) => {
    // Modal submit handling
    if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      const modal = interaction as ModalSubmitInteraction;
      try {
        // route by customId
        if (modal.customId === 'mountain_add_modal') {
          // @ts-ignore - module or its type declaration may be missing at compile time
          const handler = await import('../commands/mountain/addModal');
          await handler.default(modal);
        }
      } catch (err) {
        log('modal handler error:', err);
        try { await interaction.reply({ content: 'モーダルの処理に失敗しました。', ephemeral: true }); } catch (_) {}
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const cmd = commands[interaction.commandName];
    if (!cmd) {
      await interaction.reply({ content: '未対応のコマンドです。', ephemeral: true });
      return;
    }

    try {
      // Do not globally defer here; commands will defer themselves when needed.
      await cmd(interaction as ChatInputCommandInteraction);
    } catch (err) {
      log(`Command '${interaction.commandName}' failed:`, err);
      const msg = 'コマンド実行中にエラーが発生しました。';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
  };
}
