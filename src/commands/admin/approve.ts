import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from 'discord.js';
import { supabase, prisma } from '../../utils/db';
import { log } from '../../utils/logger';
import { formatEmbed } from '../../utils/format';

export default {
  data: { name: 'admin_approve' },
  async execute(interaction: ChatInputCommandInteraction) {
    // 管理者チェック: Discord の管理者権限を持つか、環境変数で指定したロールを持っているか
    const ADMIN_ROLE = process.env.ADMIN_ROLE_ID;
    const member = interaction.member as any;
    const isAdmin = interaction.memberPermissions?.has?.('Administrator') || (ADMIN_ROLE && member?.roles?.cache?.has && member.roles.cache.has(ADMIN_ROLE));
    if (!isAdmin) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // fetch pending user_mountains
      let pending: any[] = [];
      if (supabase) {
        const { data, error } = await supabase.from('user_mountains').select('*').eq('approved', false).order('created_at', { ascending: false }).limit(10);
        if (error) throw error;
        pending = data ?? [];
      } else {
        // fallback to prisma
  pending = await prisma.userMountain.findMany({ where: { approved: false }, orderBy: { created_at: 'desc' }, take: 10 });
      }

      if (!pending || pending.length === 0) {
        await interaction.editReply({ content: '承認待ちの山情報はありません。' });
        return;
      }

      // show the first pending item with Approve/Reject buttons; collector handles actions and iterates
      let idx = 0;

      const buildMessage = async (i: number) => {
        const item = pending[i];
        const embed = formatEmbed(item.name ?? '無題', `${item.description ?? ''}\n\n標高: ${item.elevation ?? '不明'}\n追加者: ${item.added_by ?? '不明'}\nID: ${item.id}`) as EmbedBuilder;
        const approve = new ButtonBuilder().setCustomId('approve_yes').setLabel('承認').setStyle(ButtonStyle.Success);
        const reject = new ButtonBuilder().setCustomId('approve_no').setLabel('却下').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approve, reject);
        return { embeds: [embed], components: [row] };
      };

      const initial = await buildMessage(0);
      const msg = await interaction.editReply(initial) as any;

      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 1000 * 60 * 5 });

      collector.on('collect', async (btn: any) => {
        try {
          await btn.deferUpdate();
          if (btn.customId === 'approve_yes') {
            const item = pending[idx];
            if (supabase) {
              await supabase.from('user_mountains').update({ approved: true }).eq('id', item.id);
            } else {
              await prisma.userMountain.update({ where: { id: item.id }, data: { approved: true } });
            }
            await btn.followUp({ content: `承認しました: ${item.name}`, ephemeral: true });
          } else if (btn.customId === 'approve_no') {
            const item = pending[idx];
            if (supabase) {
              await supabase.from('user_mountains').delete().eq('id', item.id);
            } else {
              await prisma.userMountain.delete({ where: { id: item.id } });
            }
            await btn.followUp({ content: `却下しました: ${item.name}`, ephemeral: true });
          }

          // advance to next
          idx += 1;
          if (idx >= pending.length) {
            collector.stop('done');
            await interaction.editReply({ content: '全て処理しました。', embeds: [], components: [] });
            return;
          }
          const next = await buildMessage(idx);
          await interaction.editReply(next);
        } catch (e: any) {
          log('admin_approve collect error:', e);
        }
      });

      collector.on('end', async (_collected: any[], reason: string) => {
        if (reason !== 'done') {
          try { await interaction.editReply({ content: '承認セッションの時間切れです。', embeds: [], components: [] }); } catch (e) { }
        }
      });

    } catch (err: any) {
      log('admin_approve error:', err);
      await interaction.editReply({ content: '承認リストの取得に失敗しました。' });
    }
  },
};
