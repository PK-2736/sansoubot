import { ChatInputCommandInteraction } from 'discord.js';
import { getMountain, BASE as MOUNTIX_BASE } from '../../utils/api/mountix';
import { supabase } from '../../utils/db';
import { formatEmbed } from '../../utils/format';
import { generateStaticMap } from '../../utils/api/map';
import fetchWikipediaImage from '../../utils/api/wiki';
import { log } from '../../utils/logger';
import { normalizeMountainData } from '../../utils/normalize';
import safeReply from '../../utils/discord';
// '../../utils/image' モジュールが無い場合のフォールバック: undefined を返して外部画像 URL を使用するようにします。
// 実装があれば置き換えてください。
const fetchImageAttachment = async (_url: string): Promise<{ filename: string; attachment: unknown } | undefined> => undefined;

export default {
  data: { name: 'mountain_info' },
  async execute(interaction: ChatInputCommandInteraction) {
  // 長時間の処理中にトークンが期限切れにならないよう早めに ACK します
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply(); } catch (e: any) { log('mountain_info: deferReply failed at start:', e?.message ?? e); }
    }
    const id = interaction.options?.getString && interaction.options.getString('id')
      ? interaction.options.getString('id')!
      : undefined;

    if (!id) {
  await interaction.reply({ content: '山IDまたは山名を指定してください。', flags: (await import('../../utils/flags')).EPHEMERAL });
      return;
    }

    try {
  // 1) まず Mountix を試行します
      let m = null as any;
      let source = 'Mountix';
      try {
        m = await getMountain(id);
      } catch (_) {
        m = null;
      }

  // 2) 見つからない場合は Supabase の user_mountains を id または名前で検索します
  let addedBy: string | undefined = undefined;
  let addedByName: string | undefined = undefined;
      if (!m) {
        if (supabase) {
          // if id looks like user-<uuid> (used in search merge), strip prefix
          const q = String(id).replace(/^user-/, '');
          const { data } = await supabase.from('user_mountains').select('*').or(`id.eq.${q},name.ilike.%${q}%`).limit(1);
          if (data && data.length) {
            const d = data[0] as any;
            m = { id: `user-${d.id}`, name: d.name, elevation: d.elevation, description: d.description, photo_url: d.photo_url, prefectures: [], coords: undefined };
            source = 'Supabase';
            // Supabase は Discord のスノーフレークを 'added_by' または 'discord_id' のいずれかに格納している可能性があります
            addedBy = d.discord_id ?? d.added_by ?? undefined;
            // Discord ユーザー名を取得
            if (addedBy && interaction.client && typeof interaction.client.users?.fetch === 'function') {
              try {
                const user = await interaction.client.users.fetch(addedBy);
                if (user) addedByName = `${user.username}#${user.discriminator}`;
              } catch (_) {
                // 取得失敗時はメンションでフォールバック
                addedByName = `<@${addedBy}>`;
              }
            }
            // 最終フォールバック: 名前が取得できない場合は ID をメンションとして表示します
            if (!addedByName && addedBy) addedByName = `<@${addedBy}>`;
          }
        }
      }

  // 3) それでも見つからなければ Wikipedia のサマリーを試します
      let wikiSummary: any = undefined;
      if (!m) {
        wikiSummary = await fetchWikipediaImage(id) ? { } : undefined; // placeholder to check
        // Use summary API to fetch authoritative info
        const summary = await (await import('../../utils/api/wiki')).fetchWikipediaSummary(id).catch(() => undefined);
        if (summary) {
          m = { id: `wiki-${summary.title}`, name: summary.title, elevation: undefined, description: summary.extract, photo_url: summary.originalimage?.source, prefectures: [], coords: undefined };
          source = 'Wikipedia';
          addedBy = 'Wikipedia';
        }
      }
      // 正規化
      const norm = normalizeMountainData({ id: m.id, name: m.name, elevation: m.elevation, coords: m.coords, description: m.description, photo_url: m.photo_url, source });

      const lines = [
        `名前: ${norm.name}`,
        `標高: ${norm.elevation ?? '不明'} m`,
        `場所: ${m.prefectures && m.prefectures.length ? m.prefectures.join(', ') : (m.gsiUrl ?? '不明')}`,
        norm.description ? `\n${norm.description}` : '',
        `\nソース: ${source}`,
        addedByName ? `追加者: ${addedByName}` : (addedBy ? `追加者: ${addedBy}` : ''),
      ];

  // 出典リンク: Mountix / Supabase / Wikipedia
      const sourceLinks: string[] = [];
      if (source === 'Mountix' && m.id) {
        sourceLinks.push(`<${MOUNTIX_BASE}/mountains/${encodeURIComponent(String(m.id))}>`);
      }
      if (source === 'Supabase' && m.id) {
        // m.id for user records is prefixed 'user-<id>' in our code; show the record id
        const rid = String(m.id).replace(/^user-/, '');
        sourceLinks.push(`Supabase record ID: ${rid}`);
      }

      const embeds = [formatEmbed(norm.name, lines.join('\n')) as any];
  // 画像の優先順: Mountix / Supabase の photo_url -> Wikipedia の代表画像 -> Static Map
      let imageUrl: string | undefined = m.photo_url ?? undefined;
      let wikiPageUrl: string | undefined;
      if (!imageUrl && m.name) {
        const wikiImage = await fetchWikipediaImage(m.name, (m as any).nameKana ?? undefined);
        if (wikiImage) imageUrl = wikiImage;
      }
  // サマリーを取得して正規の URL を抽出し、出典リンクに追加します
      try {
        const summary = await (await import('../../utils/api/wiki')).fetchWikipediaSummary(m.name).catch(() => undefined);
        if (summary) {
          wikiPageUrl = summary.content_urls?.desktop?.page ?? summary.canonical_url ?? `https://ja.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;
          if (wikiPageUrl) sourceLinks.push(`<${wikiPageUrl}>`);
        }
      } catch (e) { /* ignore */ }
      if (!imageUrl && m.coords) {
        imageUrl = generateStaticMap(m.coords, 12, '700x400');
      }
  const files: any[] = [];
  if (imageUrl) {
    log('mountain_info: setting imageUrl:', imageUrl);
    try {
  // まず画像を添付ファイルとしてダウンロードして添付できるか試みます
      const fetched = await fetchImageAttachment(imageUrl).catch(() => undefined);
      if (fetched) {
  // Discord が添付画像を表示するように attachment:// を使用します
        (embeds[0] as any).setImage?.(`attachment://${fetched.filename}`);
        files.push(fetched.attachment);
      } else {
  // フォールバックとして外部 URL を使用します
        (embeds[0] as any).setImage?.(imageUrl);
      }
    } catch (e: any) {
      log('mountain_info: image attach fallback failed', String(e?.message ?? e));
      (embeds[0] as any).setImage?.(imageUrl);
    }
  }
  if (sourceLinks.length) (embeds[0] as any).addFields?.({ name: '出典リンク', value: sourceLinks.join('\n') });

  // Wikipediaページボタンを追加
  if (wikiPageUrl) {
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const wikiButton = new ButtonBuilder()
      .setLabel('Wikipediaで詳しく見る')
      .setStyle(ButtonStyle.Link)
      .setURL(wikiPageUrl);
    const wikiRow = new ActionRowBuilder().addComponents(wikiButton);
    await safeReply(interaction, { embeds, files: files.length ? files : undefined, components: [wikiRow.toJSON()] });
  } else {
    await safeReply(interaction, { embeds, files: files.length ? files : undefined });
  }
    } catch (err: any) {
      log('mountain_info error:', err);
  try { await safeReply(interaction, { content: '山情報の取得に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL }); } catch (_) {}
    }
  },
};
