import { Guild } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { log } from '../utils/logger';

type AppCommand = { name: string; description: string };

export default function createGuildCreateHandler(commands: AppCommand[]) {
  return async (guild: Guild) => {
    try {
      log(`Joined guild ${guild.id} (${guild.name}).`);
      // グローバルコマンドのみを使用するため、ギルド固有の登録は行わない
      log('Commands are registered globally, no guild-specific registration needed.');
    } catch (err: any) {
      log('guildCreate handler error:', err?.message ?? err);
    }
  };
}
