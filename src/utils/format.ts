import { EmbedBuilder } from 'discord.js';

export function formatEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x2f6f4f)
    .setTimestamp();
}
