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

      // 選択状態を管理
      let selected: Record<string, boolean> = {};
      pending.forEach(item => { selected[item.id] = false; });

      // embedリストとボタン群を生成
      const buildMessage = async () => {
        const embeds = pending.map((item, idx) => {
          let addedByText = item.added_by ?? '不明';
          if (item.discord_id) {
            try {
              const user = interaction.client.users.cache.get(String(item.discord_id));
              if (user) addedByText = `${user.username}#${user.discriminator}`;
              else addedByText = `<@${String(item.discord_id)}>`;
            } catch (_) {
              addedByText = `<@${String(item.discord_id)}>`;
            }
          }
          return formatEmbed(
            `${selected[item.id] ? '✅ ' : ''}${item.name ?? '無題'} (${idx + 1})`,
            `${item.description ?? ''}\n標高: ${item.elevation ?? '不明'}\n追加者: ${addedByText}\nID: ${item.id}`
          ) as EmbedBuilder;
        });
        // 各山ごとに選択トグルボタン
        const rows = [];
        for (let i = 0; i < pending.length; i += 5) {
          const btns = pending.slice(i, i + 5).map(item =>
            new ButtonBuilder()
              .setCustomId(`toggle_${item.id}`)
              .setLabel(`${selected[item.id] ? '選択解除' : '選択'}`)
              .setStyle(selected[item.id] ? ButtonStyle.Secondary : ButtonStyle.Primary)
          );
          rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...btns).toJSON());
        }
        // 一括承認ボタン
        const approveBtn = new ButtonBuilder()
          .setCustomId('approve_selected')
          .setLabel('選択した山を一括承認')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!Object.values(selected).some(v => v));
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn).toJSON());
        return { embeds, components: rows };
      };

      let msg = await interaction.editReply(await buildMessage()) as any;
      const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 1000 * 60 * 5 });

      collector.on('collect', async (btn: any) => {
        try {
          await btn.deferUpdate();
          if (btn.customId.startsWith('toggle_')) {
            const id = btn.customId.replace('toggle_', '');
            selected[id] = !selected[id];
            await interaction.editReply(await buildMessage());
          } else if (btn.customId === 'approve_selected') {
            const toApprove = pending.filter(item => selected[item.id]);
            for (const item of toApprove) {
              if (supabase) {
                await supabase.from('user_mountains').update({ approved: true }).eq('id', item.id);
              } else {
                await prisma.userMountain.update({ where: { id: item.id }, data: { approved: true } });
              }
            }
            await interaction.editReply({ content: `承認しました: ${toApprove.map(i => i.name).join(', ')}`, embeds: [], components: [] });
            collector.stop('done');
          }
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
