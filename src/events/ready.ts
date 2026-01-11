import { Client } from 'discord.js';
import { log } from '../utils/logger';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

type AppCommand = { name: string; description: string };

export default function createReadyHandler(commands: AppCommand[]) {
  return async (client: Client) => {
    log(`${client.user?.tag} is ready.`);
    try {
      // すべてのコマンドをグローバル登録
      log('Registering commands globally...');
      await client.application?.commands.set(commands as any);
      log(`Registered ${commands.length} slash commands globally.`);
    } catch (err) {
      log('Failed to register slash commands:', err);
    }
  };
}
