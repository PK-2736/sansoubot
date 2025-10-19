import { ChatInputCommandInteraction } from 'discord.js';

export default {
  data: { name: 'quiz_start' },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Quiz start coming soon.');
  },
};
