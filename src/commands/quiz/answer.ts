import { ChatInputCommandInteraction } from 'discord.js';

export default {
  data: { name: 'quiz_answer' },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Quiz answer coming soon.');
  },
};
