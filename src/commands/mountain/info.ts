import { ChatInputCommandInteraction } from 'discord.js';
import { getMountain, BASE as MOUNTIX_BASE } from '../../utils/api/mountix';
import { supabase } from '../../utils/db';
import { formatEmbed } from '../../utils/format';
import { generateStaticMap } from '../../utils/api/map';
import fetchWikipediaImage from '../../utils/api/wiki';
import { log } from '../../utils/logger';
import { normalizeMountainData } from '../../utils/normalize';
import safeReply from '../../utils/discord';
import fetchImageAttachment from '../../utils/image';

export default {
  data: { name: 'mountain_info' },
  async execute(interaction: ChatInputCommandInteraction) {
    // Acknowledge early to prevent token expiration during long processing
    if (!interaction.deferred && !interaction.replied) {
      try { await interaction.deferReply(); } catch (e: any) { log('mountain_info: deferReply failed at start:', e?.message ?? e); }
    }
    const id = interaction.options?.getString && interaction.options.getString('id')
      ? interaction.options.getString('id')!
      : undefined;

    if (!id) {
      await interaction.reply({ content: '山IDまたは山名を指定してください。', ephemeral: true });
      return;
    }

    try {
      // 1) Try Mountix first
      let m = null as any;
      let source = 'Mountix';
      try {
        m = await getMountain(id);
      } catch (_) {
        m = null;
      }

      // 2) If not found, try Supabase user_mountains by id or name
      let addedBy: string | undefined = undefined;
      if (!m) {
        if (supabase) {
          // if id looks like user-<uuid> (used in search merge), strip prefix
          const q = String(id).replace(/^user-/, '');
          const { data } = await supabase.from('user_mountains').select('*').or(`id.eq.${q},name.ilike.%${q}%`).limit(1);
          if (data && data.length) {
            const d = data[0] as any;
            m = { id: `user-${d.id}`, name: d.name, elevation: d.elevation, description: d.description, photo_url: d.photo_url, prefectures: [], coords: undefined };
            source = 'Supabase';
            addedBy = d.added_by;
          }
        }
      }

      // 3) If still not found, try Wikipedia summary
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
        addedBy ? `追加者: ${addedBy}` : '',
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
      // Try to fetch summary to extract canonical URL and add to source links
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
      // try to download image as attachment first
      const fetched = await fetchImageAttachment(imageUrl).catch(() => undefined);
      if (fetched) {
        // use attachment:// so Discord will display the attached image
        (embeds[0] as any).setImage?.(`attachment://${fetched.filename}`);
        files.push(fetched.attachment);
      } else {
        // fallback to external URL
        (embeds[0] as any).setImage?.(imageUrl);
      }
    } catch (e: any) {
      log('mountain_info: image attach fallback failed', String(e?.message ?? e));
      (embeds[0] as any).setImage?.(imageUrl);
    }
  }
  if (sourceLinks.length) (embeds[0] as any).addFields?.({ name: '出典リンク', value: sourceLinks.join('\n') });

      await safeReply(interaction, { embeds, files: files.length ? files : undefined });
    } catch (err: any) {
      log('mountain_info error:', err);
      try { await safeReply(interaction, { content: '山情報の取得に失敗しました。', ephemeral: true }); } catch (_) {}
    }
  },
};
