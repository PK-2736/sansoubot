import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { searchMountains, BASE as MOUNTIX_BASE } from '../../utils/api/mountix';
import { formatEmbed } from '../../utils/format';
import { log } from '../../utils/logger';
import fetchWikipediaImage, { fetchWikipediaSummary } from '../../utils/api/wiki';
import { supabase } from '../../utils/db';
import safeReply from '../../utils/discord';
import { AttachmentBuilder } from 'discord.js';

const fetchImageAttachment = async (
  url?: string
): Promise<{ filename: string; attachment: AttachmentBuilder } | undefined> => {
  if (!url) return undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const pathname = (() => {
      try { return new URL(url).pathname; } catch { return url; }
    })();
    const m = pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)(?:$|\?)/i);
    const ext = (m?.[1] ?? 'jpg').toLowerCase();
    const filename = `image_${Date.now()}.${ext}`;
    const attachment = new AttachmentBuilder(buffer, { name: filename });
    return { filename, attachment };
  } catch {
    return undefined;
  }
};

export default {
  data: { name: 'mountain_search' },
  async execute(interaction: ChatInputCommandInteraction) {
  // Acknowledge early to keep the interaction valid; handle failure gracefully
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferReply(); } catch (e: any) { log('mountain_search: deferReply failed at start:', e?.message ?? e); }
  }
  const q = interaction.options?.getString && interaction.options.getString('q') ? interaction.options.getString('q')! : undefined;
  const nameOption = interaction.options?.getString && interaction.options.getString('name') ? interaction.options.getString('name')! : undefined;
  const limitStr = interaction.options?.getString && interaction.options.getString('limit') ? interaction.options.getString('limit')! : undefined;
    const limit = limitStr ? Math.min(50, Math.max(1, Number(limitStr) || 5)) : 10;

    try {
      // 長時間処理する可能性があるため早めに defer して Interaction の有効期限切れを防ぐ
      // defer is handled centrally in interactionCreate; do not defer again here to avoid double-ack
  const params: any = { limit };
  // 新: name オプションを優先、旧 q はフォールバック
  if (nameOption) params.name = nameOption;
  else if (q) params.name = q;
      // 追加オプション: tag / prefecture / offset / sort をオプションで渡す作りにしていればここで収集できます

      const rows = await searchMountains(params);
      if (!rows || rows.length === 0) {
        await safeReply(interaction, { content: '一致する山が見つかりませんでした。', ephemeral: true });
        return;
      }

      // ページネーション: 1ページあたり表示する件数
      const perPage = 1; // 1件ずつ大きな画像で見せる
      const pages = Math.max(1, Math.ceil(rows.length / perPage));

      // pre-resolve thumbnails and source links for all rows (sequentially to avoid spamming external APIs)
  const thumbs: (string | undefined)[] = [];
  const sources: string[] = []; // text for source label
  const sourceLinks: (string | undefined)[] = []; // URL or ID text
  const addedBys: (string | undefined)[] = [];
  for (const r of rows) {
        // thumbnail
        if (r.photo_url) thumbs.push(r.photo_url);
        else {
          const wikiImg = await fetchWikipediaImage(r.name, (r as any).nameKana ?? undefined);
          thumbs.push(wikiImg ?? undefined);
        }

        // determine source: user-* prefix for Supabase user_mountains
        const rid = String(r.id ?? '');
        if (rid.startsWith('user-')) {
          sources.push('Supabase');
          const uid = rid.replace(/^user-/, '');
          // store record id text; we'll try to fetch added_by if supabase client is available
          sourceLinks.push(`Supabase record: \`${uid}\``);
          if (supabase) {
            try {
              const { data } = await supabase.from('user_mountains').select('added_by').eq('id', uid).maybeSingle();
              const ab = (data as any)?.added_by ?? undefined;
              addedBys.push(ab ? String(ab) : undefined);
            } catch (e) {
              addedBys.push(undefined);
            }
          } else {
            addedBys.push(undefined);
          }
        } else {
          sources.push('Mountix');
          try {
            sourceLinks.push(`<${MOUNTIX_BASE}/mountains/${encodeURIComponent(String(r.id))}>`);
          } catch (_) {
            sourceLinks.push(undefined);
          }
          addedBys.push(undefined);
        }

        // try to get a wikipedia page url for better provenance
        try {
          const summary = await fetchWikipediaSummary(r.name).catch(() => undefined);
          if (summary) {
            const wikiPage = summary.content_urls?.desktop?.page ?? summary.canonical_url ?? `https://ja.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;
            // prefer to append wiki URL to existing sourceLinks (as URL)
            const prev = sourceLinks[sourceLinks.length - 1];
            sourceLinks[sourceLinks.length - 1] = prev ? `${prev}\n<${wikiPage}>` : `<${wikiPage}>`;
          }
        } catch (_) {
          // ignore wiki failures
        }
      }

      const buildEmbed = (pageIndex: number) => {
        const idx = pageIndex * perPage;
        const r = rows[idx];
        const desc = `${r.name} — ${r.elevation ?? '不明'} m — ${r.prefectures?.join ? r.prefectures.join(', ') : '不明'}\n(id: ${r.id})`;
        const eb = formatEmbed(`${r.name} — ${idx + 1}/${rows.length}`, desc) as any;
        // 大きい画像をメイン画像として表示（thumbnail ではなく embed image）
        if (thumbs[idx]) {
          log('mountain_search: setting image for', r.name, thumbs[idx]);
          eb.setImage?.(thumbs[idx]);
        }
        // add source information similar to /mountain_info
        const srcLabel = sources[idx] ?? '不明';
        const srcLinkText = sourceLinks[idx];
        const addedBy = addedBys[idx];
        try {
          const parts: string[] = [];
          if (srcLinkText) parts.push(srcLinkText);
          else parts.push(srcLabel);
          if (addedBy) parts.push(`追加者: \`${addedBy}\``);
          eb.addFields?.({ name: '出典', value: parts.join('\n') });
        } catch (_) {
          // ignore if addFields not available
        }
        return eb;
      };

      const initialEmbed = buildEmbed(0);

      const prevButton = new ButtonBuilder().setCustomId('prev').setLabel('◀️ 前へ').setStyle(ButtonStyle.Primary).setDisabled(true);
      const nextButton = new ButtonBuilder().setCustomId('next').setLabel('次へ ▶️').setStyle(ButtonStyle.Primary).setDisabled(pages <= 1);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);

      // attempt to attach the initial image as a file fallback and use attachment:// if available
      const initialFiles: any[] = [];
      try {
        const imgUrl = thumbs[0];
        if (imgUrl) {
          const fetched = await fetchImageAttachment(imgUrl).catch(() => undefined);
          if (fetched) {
            // if we fetched it, set embed image to attachment://filename
            (initialEmbed as any).setImage?.(`attachment://${fetched.filename}`);
            initialFiles.push(fetched.attachment);
          }
        }
      } catch (e) {
        // ignore
      }

      await safeReply(interaction, { embeds: [initialEmbed], components: [row], files: initialFiles.length ? initialFiles : undefined });
      // fetch the message object to create collector
      const message = (await interaction.fetchReply()) as any;
      const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });
      let current = 0;
      collector.on('collect', async (i: any) => {
        try {
          if (i.customId === 'prev') current = Math.max(0, current - 1);
          if (i.customId === 'next') current = Math.min(pages - 1, current + 1);

          const eb = buildEmbed(current);
          prevButton.setDisabled(current <= 0);
          nextButton.setDisabled(current >= pages - 1);
          const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
          await i.update({ embeds: [eb], components: [newRow] });
        } catch (err) {
          log('collector error:', err);
        }
      });

      collector.on('end', async () => {
        try {
          prevButton.setDisabled(true);
          nextButton.setDisabled(true);
          const finalRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);
          await message.edit({ components: [finalRow] });
        } catch (e) {
          // ignore
        }
      });
    } catch (err: any) {
      log('mountain_search error:', err);
      const msg = '検索に失敗しました。';
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, ephemeral: true });
        } else {
          await interaction.reply({ content: msg, ephemeral: true });
        }
      } catch (_) {
        // ignore follow-up errors
      }
    }
  },
};
