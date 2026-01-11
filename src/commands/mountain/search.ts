import { ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { searchMountains, BASE as MOUNTIX_BASE, getMountain } from '../../utils/api/mountix';
import { formatEmbed } from '../../utils/format';
import { log } from '../../utils/logger';
import fetchWikipediaImage, { fetchWikipediaSummary } from '../../utils/api/wiki';
import { prisma } from '../../utils/db';
import safeReply from '../../utils/discord';
import { AttachmentBuilder } from 'discord.js';
import { normalizeMountainData } from '../../utils/normalize';
import { generateStaticMap } from '../../utils/api/map';

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
  // 長時間処理される可能性があるため早めに ACK して Interaction の有効期限切れを防ぎ、失敗を優雅に扱います
  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferReply(); } catch (e: any) { log('mountain_search: deferReply failed at start:', e?.message ?? e); }
  }
  const nameOption = interaction.options?.getString && interaction.options.getString('山名') ? interaction.options.getString('山名')! : undefined;
  const idOption = interaction.options?.getString && interaction.options.getString('id') ? interaction.options.getString('id')! : undefined;

    try {
  // id オプションが指定された場合、詳細な山情報を表示します（mountain_info の機能を統合）
      if (idOption) {
        const id = idOption;
  // 1) まず Mountix を試します
        let m: any = null;
        let source = 'Mountix';
        try {
          m = await getMountain(id);
        } catch (_) {
          m = null;
        }

        let addedBy: string | undefined = undefined;
        let addedByName: string | undefined = undefined;
  // 2) 次に内部DBの user_mountains を確認します
        if (!m) {
          const qid = String(id).replace(/^user-/, '');
          const byId = await prisma.userMountain.findUnique({ where: { id: qid } }).catch(() => null);
          const byName = byId ? null : await prisma.userMountain.findFirst({ where: { name: { contains: qid } } }).catch(() => null);
          const d: any = byId ?? byName;
          if (d) {
            m = { id: `user-${d.id}`, name: d.name, nameKana: d.nameKana ?? undefined, elevation: d.elevation ?? undefined, description: d.description ?? undefined, photo_url: d.photo_url ?? undefined, prefectures: [], coords: undefined };
            source = 'Local';
            addedBy = d.added_by ?? undefined;
            if (addedBy && interaction.client && typeof interaction.client.users?.fetch === 'function') {
              try {
                const user = await interaction.client.users.fetch(addedBy);
                if (user) addedByName = `${user.username}#${user.discriminator}`;
              } catch (_) {
                addedByName = `<@${addedBy}>`;
              }
            }
            if (!addedByName && addedBy) addedByName = `<@${addedBy}>`;
          }
        }

  // 3) それでも見つからなければ Wikipedia をフォールバックとして試行します
        if (!m) {
          const summary = await fetchWikipediaSummary(id).catch(() => undefined);
          if (summary) {
            m = { id: `wiki-${summary.title}`, name: summary.title, elevation: undefined, description: summary.extract, photo_url: summary.originalimage?.source, prefectures: [], coords: undefined };
            source = 'Wikipedia';
            addedBy = 'Wikipedia';
          }
        }

        if (!m) {
          await safeReply(interaction, { content: '山情報が見つかりませんでした。', flags: (await import('../../utils/flags')).EPHEMERAL });
          return;
        }

        const norm = normalizeMountainData({ id: m.id, name: m.name, elevation: m.elevation, coords: m.coords, description: m.description, photo_url: m.photo_url, source });
        const displayName = (m as any).nameKana ? `${norm.name}（${(m as any).nameKana}）` : norm.name;
        const lines = [
          `名前: ${displayName}`,
          `標高: ${norm.elevation ?? '不明'} m`,
          `場所: ${m.prefectures && m.prefectures.length ? m.prefectures.join(', ') : (m.gsiUrl ?? '不明')}`,
          norm.description ? `\n📝 説明:\n${norm.description}` : '',
          `\nソース: ${source}`,
          addedByName ? `追加者: ${addedByName}` : (addedBy ? `追加者: ${addedBy}` : ''),
        ];

        const sourceLinks: string[] = [];
        if (source === 'Mountix' && m.id) {
          sourceLinks.push(`<${MOUNTIX_BASE}/mountains/${encodeURIComponent(String(m.id))}>`);
        }
        if (source === 'Local' && m.id) {
          const rid = String(m.id).replace(/^user-/, '');
          sourceLinks.push(`Local record ID: ${rid}`);
        }

        const embeds = [formatEmbed(norm.name, lines.join('\n')) as any];
        let imageUrl: string | undefined = m.photo_url ?? undefined;
        let wikiPageUrl: string | undefined;
        if (!imageUrl && m.name) {
          const wikiImage = await fetchWikipediaImage(m.name, (m as any).nameKana ?? undefined);
          if (wikiImage) imageUrl = wikiImage;
        }
        try {
          const summary = await fetchWikipediaSummary(m.name).catch(() => undefined);
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
          try {
            const fetched = await fetchImageAttachment(imageUrl).catch(() => undefined);
            if (fetched) {
              (embeds[0] as any).setImage?.(`attachment://${fetched.filename}`);
              files.push(fetched.attachment);
            } else {
              (embeds[0] as any).setImage?.(imageUrl);
            }
          } catch (e: any) {
            log('mountain_search (info branch): image attach fallback failed', String(e?.message ?? e));
            (embeds[0] as any).setImage?.(imageUrl);
          }
        }
        if (sourceLinks.length) (embeds[0] as any).addFields?.({ name: '出典リンク', value: sourceLinks.join('\n') });
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
        return;
      }
      // 長時間処理する可能性があるため早めに defer して Interaction の有効期限切れを防ぐ
  // defer は interactionCreate 側で中央管理されています。ここで再度 defer して二重 ACK にならないように注意してください
  const params: any = {};
  // 山名は必須引数なのでそのまま使用
  params.name = nameOption;
      // 追加オプション: tag / prefecture / offset / sort をオプションで渡す作りにしていればここで収集できます

      const rows = await searchMountains(params);
      if (!rows || rows.length === 0) {
  await safeReply(interaction, { content: '一致する山が見つかりませんでした。', flags: (await import('../../utils/flags')).EPHEMERAL });
        return;
      }

      // ページネーション: 1ページあたり表示する件数
      const perPage = 1; // 1件ずつ大きな画像で見せる
      const pages = Math.max(1, Math.ceil(rows.length / perPage));

  // すべての行についてサムネイルや出典リンクを事前解決（並列処理で高速化）
  const thumbs: (string | undefined)[] = [];
  const sources: string[] = []; // 出典ラベル用テキスト
  const sourceLinks: (string | undefined)[] = []; // URL または ID 文字列
  const addedBys: (string | undefined)[] = [];
  
  // 画像取得を並列で実行
  const wikiImages = await Promise.allSettled(
    rows.map(r => {
      if (r.photo_url) return Promise.resolve(r.photo_url);
      return fetchWikipediaImage(r.name, (r as any).nameKana ?? undefined);
    })
  );
  
  log('mountain_search: wikiImages results count:', wikiImages.length);
  for (let idx = 0; idx < wikiImages.length; idx++) {
    const result = wikiImages[idx];
    if (result.status === 'fulfilled') {
      log(`mountain_search: [${idx}] ${rows[idx]?.name} -> ${result.value?.substring(0, 50) ?? 'undefined'}`);
    } else {
      log(`mountain_search: [${idx}] ${rows[idx]?.name} -> REJECTED`);
    }
  }
  
  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    // thumbnail from parallel result
    const imgResult = wikiImages[idx];
    if (imgResult.status === 'fulfilled' && imgResult.value) {
      thumbs.push(imgResult.value);
    } else {
      thumbs.push(undefined);
    }

    // 出典を判定: 内部DBのユーザー追加レコードは id に 'user-' プレフィックスを付与しています
    const rid = String(r.id ?? '');
    if (rid.startsWith('user-')) {
      sources.push('Local');
      const uid = rid.replace(/^user-/, '');
      // 内部DBから追加者情報を取得
      sourceLinks.push(`Local record: \`${uid}\``);
      try {
        const row = await prisma.userMountain.findUnique({ where: { id: uid }, select: { added_by: true } });
        let display: string | undefined = undefined;
        if (row?.added_by) {
          try {
            const user = await interaction.client.users.fetch(String(row.added_by));
            display = `${user.username}#${user.discriminator}`;
          } catch (_) {
            display = `<@${String(row.added_by)}>`;
          }
        }
        addedBys.push(display);
      } catch (_) {
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

    // 出典の裏取りのため Wikipedia のページ URL を取得しておきます
    try {
      const summary = await fetchWikipediaSummary(r.name).catch(() => undefined);
      if (summary) {
        const wikiPage = summary.content_urls?.desktop?.page ?? summary.canonical_url ?? `https://ja.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`;
        // 取得した Wikipedia URL を既存の sourceLinks に優先して追加します
        const prev = sourceLinks[sourceLinks.length - 1];
        sourceLinks[sourceLinks.length - 1] = prev ? `${prev}\n<${wikiPage}>` : `<${wikiPage}>`;
      }
    } catch (_) {
      // Wiki の取得に失敗しても無視します
    }
  }

      const buildEmbed = (pageIndex: number) => {
  const idx = pageIndex * perPage;
  const r = rows[idx];
      const shortDesc = r.description ? (String(r.description).replace(/\s+/g,' ').slice(0,140) + (String(r.description).length > 140 ? '…' : '')) : '';
      const place = r.prefectures?.join ? r.prefectures.join(', ') : '不明';
      // 漢字のみを表示（nameKanaがあれば除外）
      const displayName = r.name;
      const desc = `${displayName} — ${r.elevation ?? '不明'} m — ${place}` + (shortDesc ? `\n\n${shortDesc}` : '');
  const eb = formatEmbed(`${displayName} — ${idx + 1}/${rows.length}`, desc) as any;
  // サムネイルではなく大きめの画像を embed のメイン画像として表示します
  log(`buildEmbed: idx=${idx}, name=${r.name}, thumbs[${idx}]=${thumbs[idx]?.substring(0, 50) ?? 'undefined'}`);
        if (thumbs[idx]) {
          log('mountain_search: setting image for', r.name, thumbs[idx]);
          eb.setImage?.(thumbs[idx]);
        } else {
          log('mountain_search: NO IMAGE for', r.name);
        }
  // /mountain_info と同様の出典情報を追加します
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
          // addFields が使えない場合は無視します
        }
        return eb;
      };

      const initialEmbed = buildEmbed(0);

      const prevButton = new ButtonBuilder().setCustomId('prev').setLabel('◀️ 前へ').setStyle(ButtonStyle.Primary).setDisabled(true);
      const nextButton = new ButtonBuilder().setCustomId('next').setLabel('次へ ▶️').setStyle(ButtonStyle.Primary).setDisabled(pages <= 1);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton);

  // 最初の画像をファイルとして添付できるか試み、可能なら attachment:// を使用します（フォールバック）
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

      // Wikipediaページボタンを初期表示に追加
      const idx = 0;
      const wikiMatch = sourceLinks[idx]?.match(/<([^>]+wikipedia[^>]+)>/i);
      let wikiRow;
      if (wikiMatch) {
        const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
        const wikiButton = new ButtonBuilder()
          .setLabel('Wikipediaで詳しく見る')
          .setStyle(ButtonStyle.Link)
          .setURL(wikiMatch[1]);
        wikiRow = new ActionRowBuilder().addComponents(wikiButton);
      }
      await safeReply(interaction, {
        embeds: [initialEmbed],
        components: wikiRow ? [row.toJSON(), wikiRow?.toJSON()] : [row.toJSON()],
        files: initialFiles.length ? initialFiles : undefined
      });
  // メッセージオブジェクトを取得してコンポーネントコレクタを作成します
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
  // ページ切り替え時に Wikipedia ボタンも更新します
        const wikiMatch = sourceLinks[current]?.match(/<([^>]+wikipedia[^>]+)>/i);
        let wikiRow;
        if (wikiMatch) {
          const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
          const wikiButton = new ButtonBuilder()
            .setLabel('Wikipediaで詳しく見る')
            .setStyle(ButtonStyle.Link)
            .setURL(wikiMatch[1]);
          wikiRow = new ActionRowBuilder().addComponents(wikiButton);
        }
        await i.update({
          embeds: [eb],
          components: wikiRow ? [newRow.toJSON(), wikiRow?.toJSON()] : [newRow.toJSON()]
        });
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
    // 失敗しても無視します
        }
      });
    } catch (err: any) {
      log('mountain_search error:', err);
      const msg = '検索に失敗しました。';
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: msg, flags: (await import('../../utils/flags')).EPHEMERAL });
        } else {
          await interaction.reply({ content: msg, flags: (await import('../../utils/flags')).EPHEMERAL });
        }
      } catch (_) {
        // ignore follow-up errors
      }
    }
  },
};
