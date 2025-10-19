import { Client } from 'discord.js';
import { log } from '../utils/logger';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

type AppCommand = { name: string; description: string };

export default function createReadyHandler(commands: AppCommand[]) {
  return async (client: Client) => {
    log(`${client.user?.tag} is ready.`);
    try {
      const devGuild = process.env.DEV_GUILD_ID;
      if (devGuild && process.env.DISCORD_TOKEN) {
  // 可能な限りログイン済みクライアントから取得した実際のアプリケーション ID を使用するようにします。
        try {
          if (client.application && client.application.fetch) await client.application.fetch();
        } catch (e) {
          // ignore
        }
        const actualAppId = client.application?.id;
        if (process.env.DISCORD_CLIENT_ID && actualAppId && process.env.DISCORD_CLIENT_ID !== actualAppId) {
          log(`Warning: DISCORD_CLIENT_ID (${process.env.DISCORD_CLIENT_ID}) does not match logged-in application id (${actualAppId}). Using actual application id.`);
        }
        const appId = actualAppId || process.env.DISCORD_CLIENT_ID;
        if (!appId) {
          throw new Error('Application ID not available for command registration');
        }
  // 開発中は即時反映のため単一ギルドにコマンドを登録します
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        try {
          await rest.put(Routes.applicationGuildCommands(appId, devGuild), { body: commands as any });
          log(`Registered ${commands.length} slash commands to dev guild ${devGuild} (app ${appId}).`);
        } catch (e: any) {
          // Missing Access (403) が返る場合、通常はボットがギルドに招待されていないか、権限が不足しています。
          log(`Guild registration failed (${e?.code ?? e?.status ?? 'unknown'}): ${e?.message ?? e}`);
          if (e?.status === 403 || e?.code === 50001) {
            log('Falling back to global registration. To fix guild registration, ensure the bot is invited to the guild with the correct application and scopes.');
            try {
              await client.application?.commands.set(commands as any);
              log(`Registered ${commands.length} slash commands globally (fallback).`);
            } catch (gErr) {
              log('Fallback global registration failed:', gErr);
            }
          } else {
            throw e;
          }
        }
      } else {
        await client.application?.commands.set(commands as any);
        log(`Registered ${commands.length} slash commands globally.`);
      }
    } catch (err) {
      log('Failed to register slash commands:', err);
    }
  };
}
