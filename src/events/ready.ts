import { Client } from 'discord.js';
import { log } from '../utils/logger';

type AppCommand = { name: string; description: string };

export default function createReadyHandler(commands: AppCommand[]) {
  return async (client: Client) => {
    log(`${client.user?.tag} is ready.`);
    try {
      await client.application?.commands.set(commands as any);
      log(`Registered ${commands.length} slash commands.`);
    } catch (err) {
      log('Failed to register slash commands:', err);
    }
  };
}
