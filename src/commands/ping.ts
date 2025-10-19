import { ChatInputCommandInteraction } from 'discord.js';

export default {
  data: { name: 'ping' },
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Pong!');
  },
};
