import { Guild } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { log } from '../utils/logger';

type AppCommand = { name: string; description: string };

export default function createGuildCreateHandler(commands: AppCommand[]) {
  return async (guild: Guild) => {
    try {
      log(`Joined guild ${guild.id} (${guild.name}), attempting to register commands.`);
  // アプリケーションデータが取得されていることを確認
  try { await guild.client.application?.fetch(); } catch (_) {}
      const appId = guild.client.application?.id;
      if (!appId || !process.env.DISCORD_TOKEN) {
        log('Cannot register commands for guild: missing app id or token');
        return;
      }
      const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: commands as any });
      log(`Registered ${commands.length} commands to guild ${guild.id}.`);
    } catch (err: any) {
      log('guildCreate registration failed:', err?.message ?? err);
    }
  };
}
