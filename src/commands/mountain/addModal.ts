import { ModalSubmitInteraction } from 'discord.js';
import { prisma } from '../../utils/db';
import { log } from '../../utils/logger';
import { normalizeMountainData, geocodeLocation } from '../../utils/normalize';

export default async function handleAddModal(interaction: ModalSubmitInteraction) {
  try {
    const rawName = interaction.fields.getTextInputValue('name');
    const elevationStr = interaction.fields.getTextInputValue('elevation') ?? '';
    const locationText = interaction.fields.getTextInputValue('location') ?? '';
    const description = interaction.fields.getTextInputValue('description') ?? '';

    // parse elevation
    let elevation: number | undefined = undefined;
    if (elevationStr) {
      const n = Number(elevationStr);
      if (Number.isNaN(n)) {
  await interaction.reply({ content: '標高は数値で入力してください。', flags: (await import('../../utils/flags')).EPHEMERAL });
        return;
      }
      elevation = n;
    }

    // initial normalize
    const normalized = normalizeMountainData({ name: rawName, elevation, description });

    // If coords missing and user provided a location text, try geocoding (Nominatim)
    let coords = normalized.coords;
    if (!coords && locationText) {
      const geo = await geocodeLocation(locationText);
      if (geo && geo.coords) coords = geo.coords;
    }

    // Final sanity checks: require at least a name; elevation optional but must be in allowed range if present
    if (!normalized.name) {
  await interaction.reply({ content: '名前が必要です。', flags: (await import('../../utils/flags')).EPHEMERAL });
      return;
    }

    // 内部保存（Prisma/SQLite）に登録
    const created = await prisma.userMountain.create({
      data: {
        name: normalized.name,
        elevation: normalized.elevation ?? undefined,
        location: coords ? JSON.stringify({ latitude: coords[0], longitude: coords[1] }) : (locationText || undefined),
        description: normalized.description ?? (description || undefined),
        photo_url: normalized.photo_url ?? undefined,
        added_by: interaction.user.id,
        approved: false,
      },
    });

    // チャンネルに通知送信（1459847925092978709）
    const notificationChannelId = '1459847925092978709';
    try {
      const notifChannel = await interaction.client.channels.fetch(notificationChannelId).catch(() => null);
      if (notifChannel && notifChannel.isTextBased()) {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = await import('discord.js');
        const embed = new EmbedBuilder()
          .setTitle('📢 新しい山が追加されました')
          .setDescription(`新規投稿山の承認待ち`)
          .addFields(
            { name: '山名', value: created.name, inline: false },
            { name: '標高', value: created.elevation ? `${created.elevation}m` : '未設定', inline: true },
            { name: '説明', value: created.description ?? '(なし)', inline: false },
            { name: '投稿者', value: `<@${created.added_by}>`, inline: true },
            { name: '投稿ID', value: created.id, inline: true }
          )
          .setColor(0x4caf50)
          .setTimestamp();
        
        const approveBtn = new ButtonBuilder()
          .setCustomId(`mountain_approve_${created.id}`)
          .setLabel('承認')
          .setStyle(ButtonStyle.Success);
        const rejectBtn = new ButtonBuilder()
          .setCustomId(`mountain_reject_${created.id}`)
          .setLabel('却下')
          .setStyle(ButtonStyle.Danger);
        
        const row = new ActionRowBuilder().addComponents(approveBtn, rejectBtn).toJSON();
        await (notifChannel as any).send({ embeds: [embed], components: [row] });
      }
    } catch (e) {
      log('[AddModal] Failed to send notification:', e);
    }

  await interaction.reply({ content: `山「${created.name}」を登録しました（管理者承認待ち）。`, flags: (await import('../../utils/flags')).EPHEMERAL });
  } catch (err) {
    log('addModal error:', err);
  try { await interaction.reply({ content: '登録に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL }); } catch (_) {}
  }
}
