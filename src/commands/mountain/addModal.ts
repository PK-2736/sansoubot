import { ModalSubmitInteraction } from 'discord.js';
import { supabase, prisma } from '../../utils/db';
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

    // Name must include Kanji, Katakana and Hiragana characters
    // 漢字: \p{Script=Han}, カタカナ: \p{Script=Katakana}, ひらがな: \p{Script=Hiragana}
    try {
      const n = String(rawName || '').trim();
      const hasKanji = /\p{Script=Han}/u.test(n);
      const hasKatakana = /\p{Script=Katakana}/u.test(n);
      const hasHiragana = /\p{Script=Hiragana}/u.test(n);
      if (!(hasKanji && hasKatakana && hasHiragana)) {
  await interaction.reply({ content: '山名は漢字・カタカナ・ひらがなのすべてを含めて入力してください（例: 富士ふじフジ）。', flags: (await import('../../utils/flags')).EPHEMERAL });
        return;
      }
    } catch (e) {
      // If regex with Unicode properties isn't supported for some reason, skip this strict check
    }

    const payload: any = {
      name: normalized.name,
      elevation: normalized.elevation ?? null,
      location: coords ? JSON.stringify({ latitude: coords[0], longitude: coords[1] }) : (locationText || null),
      description: normalized.description ?? (description || null),
      photo_url: normalized.photo_url ?? null,
      // For Supabase (Postgres) we keep `added_by` (uuid) null because the bot does not have
      // the Supabase auth UUID for the Discord user. Instead save Discord snowflake to
      // `discord_id` (text). The DB must have a `discord_id text` column added.
      added_by: null,
      discord_id: interaction.user.id,
      approved: false,
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      const { data, error } = await supabase.from('user_mountains').insert([payload]).select().single();
      if (error) {
        log('supabase insert error:', error);
    await interaction.reply({ content: '登録に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL });
        return;
      }
  await interaction.reply({ content: `山「${data.name}」を登録しました（管理者承認待ち）。`, flags: (await import('../../utils/flags')).EPHEMERAL });
      return;
    }

    // fallback prisma
    const created = await prisma.userMountain.create({
      data: {
        name: payload.name,
        elevation: payload.elevation ?? undefined,
        location: payload.location ?? undefined,
        description: payload.description ?? undefined,
        photo_url: payload.photo_url ?? undefined,
        // Prisma fallback uses added_by string (Discord snowflake)
        added_by: interaction.user.id,
        approved: false,
      },
    });

  await interaction.reply({ content: `山「${created.name}」を登録しました（管理者承認待ち）。`, flags: (await import('../../utils/flags')).EPHEMERAL });
  } catch (err) {
    log('addModal error:', err);
  try { await interaction.reply({ content: '登録に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL }); } catch (_) {}
  }
}
