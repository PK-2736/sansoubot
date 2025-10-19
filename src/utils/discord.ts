import { ChatInputCommandInteraction, MessagePayload, InteractionReplyOptions } from 'discord.js';
import { log } from './logger';

export async function safeReply(interaction: ChatInputCommandInteraction, payload: string | MessagePayload | InteractionReplyOptions) {
  try {
    // Prefer editReply if already deferred/replied
    if (interaction.deferred || interaction.replied) {
      try {
        // editReply accepts InteractionReplyOptions or MessagePayload
        // @ts-ignore
        return await interaction.editReply(payload as any);
      } catch (e: any) {
        log('safeReply: editReply failed, trying followUp/reply:', e?.message ?? e);
        try { return await interaction.followUp(payload as any); } catch (e2: any) { log('safeReply: followUp failed:', e2?.message ?? e2); }
      }
    } else {
      try {
        // @ts-ignore
        return await interaction.reply(payload as any);
      } catch (e: any) {
        log('safeReply: reply failed, trying followUp/editReply:', e?.message ?? e);
        try { return await interaction.followUp(payload as any); } catch (e2: any) { log('safeReply: followUp failed:', e2?.message ?? e2); }
        try { return await interaction.editReply(payload as any); } catch (e3: any) { log('safeReply: editReply failed:', e3?.message ?? e3); }
      }
    }
  } catch (err: any) {
    log('safeReply: unexpected error:', err?.message ?? err);
  }
}

export default safeReply;
