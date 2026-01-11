import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from 'discord.js';
import { prisma } from '../../utils/db';
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
      // 承認待ちの山情報を内部DBから取得
      const pending = await prisma.userMountain.findMany({ where: { approved: false }, orderBy: { created_at: 'desc' }, take: 10 });

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
          if (item.added_by) {
            try {
              const user = interaction.client.users.cache.get(String(item.added_by));
              if (user) addedByText = `${user.username}#${user.discriminator}`;
              else addedByText = `<@${String(item.added_by)}>`;
            } catch (_) {
              addedByText = `<@${String(item.added_by)}>`;
            }
          }
          return formatEmbed(
            `${selected[item.id] ? '✅ ' : ''}${item.name ?? '無題'} (${idx + 1})`,
            `${item.description ?? ''}\n標高: ${item.elevation ?? '不明'}\n追加者: ${addedByText}\nID: ${item.id}`
          ) as EmbedBuilder;
        });
        // 各山ごとに選択トグルボタン
        const rows = [];
        for (let i = 0; i < pending.length; i += 4) {
          const btns = pending.slice(i, i + 4).map(item =>
            new ButtonBuilder()
              .setCustomId(`toggle_${item.id}`)
              .setLabel(`${selected[item.id] ? '選択解除' : '選択'}`)
              .setStyle(selected[item.id] ? ButtonStyle.Secondary : ButtonStyle.Primary)
          );
          rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...btns).toJSON());
        }
        // 一括承認ボタンと却下ボタンを追加
        const approveBtn = new ButtonBuilder()
          .setCustomId('approve_selected')
          .setLabel('選択した山を一括承認')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!Object.values(selected).some(v => v));
        const individualRejectBtn = new ButtonBuilder()
          .setCustomId('reject_individual')
          .setLabel('個別却下（モーダル）')
          .setStyle(ButtonStyle.Danger);
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(approveBtn, individualRejectBtn).toJSON());
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
              await prisma.userMountain.update({ where: { id: item.id }, data: { approved: true } });
              
              // 投稿者にDM送信
              if (item.added_by) {
                try {
                  const addedByUser = await interaction.client.users.fetch(item.added_by);
                  const { EmbedBuilder } = await import('discord.js');
                  const approveEmbed = new EmbedBuilder()
                    .setTitle('✅ 山が承認されました！')
                    .setDescription(item.name)
                    .setColor(0x4caf50)
                    .setTimestamp();

                  await addedByUser.send({ embeds: [approveEmbed] });
                } catch (dmErr: any) {
                  log('[AdminApprove] Failed to send DM:', dmErr?.message);
                }
              }
            }
            await interaction.editReply({ content: `承認しました: ${toApprove.map(i => i.name).join(', ')}\n投稿者にDMを送信しました。`, embeds: [], components: [] });
            collector.stop('done');
          } else if (btn.customId === 'reject_individual') {
            // 却下する山を選択するためにmessageを更新
            const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('select_reject_mountain')
              .setPlaceholder('却下する山を選択')
              .setMaxValues(1)
              .addOptions(
                pending.map((item) => ({
                  label: item.name,
                  value: item.id,
                  description: `ID: ${item.id.substring(0, 8)}...`,
                }))
              );

            const selectRow = new ActionRowBuilder().addComponents(selectMenu).toJSON();
            const replyMsg = await interaction.editReply({ content: '却下する山を選択してください:', components: [selectRow] }) as any;
            
            // セレクトメニューの入力を待機
            const selectCollector = replyMsg.createMessageComponentCollector({ 
              filter: (i: any) => i.user.id === interaction.user.id,
              time: 60000 
            });
            
            selectCollector?.on('collect', async (selectInteraction: any) => {
              try {
                await selectInteraction.deferUpdate();
                const mountainId = selectInteraction.values[0];
                const mountain = pending.find((m: any) => m.id === mountainId);
                
                if (!mountain) {
                  await selectInteraction.reply({ content: '山が見つかりません。', ephemeral: true });
                  return;
                }

                // モーダルを表示
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
                const modal = new ModalBuilder()
                  .setCustomId(`mountain_reject_reason_${mountainId}`)
                  .setTitle('却下理由');

                const reasonInput = new TextInputBuilder()
                  .setCustomId('reject_reason')
                  .setLabel('却下理由')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('例：不適切な内容です')
                  .setRequired(true)
                  .setMaxLength(500);

                const row = new ActionRowBuilder().addComponents(reasonInput);
                modal.addComponents(row as any);
                await selectInteraction.showModal(modal);
                selectCollector.stop('modal_shown');
              } catch (err: any) {
                log('[AdminApprove] Select error:', err?.message);
              }
            });
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
