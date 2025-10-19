import { ChatInputCommandInteraction } from 'discord.js';
import { fetchPointWeather } from '../../utils/api/openmeteo';
import { getMountain, searchMountains } from '../../utils/api/mountix';
import { formatEmbed } from '../../utils/format';
import { log } from '../../utils/logger';

export default {
  data: { name: 'weather_forecast' },
  async execute(interaction: ChatInputCommandInteraction) {
    const latInput = interaction.options?.getString && interaction.options.getString('lat') ? interaction.options.getString('lat')! : undefined;
    const lonInput = interaction.options?.getString && interaction.options.getString('lon') ? interaction.options.getString('lon')! : undefined;
    const mountainId = interaction.options?.getString && interaction.options.getString('mountain') ? interaction.options.getString('mountain')! : undefined;

    try {
  // Only support point forecast: require lat/lon or mountain
  if ((latInput && lonInput) || mountainId) {
        let lat: number | undefined = undefined;
        let lon: number | undefined = undefined;
        if (mountainId) {
          // try to resolve as id or name
          let m;
          try { m = await getMountain(mountainId); } catch (_) {
            const results = await searchMountains({ name: mountainId, limit: 1 });
            m = results && results[0];
          }
          if (m && m.coords) {
            lat = m.coords[0];
            lon = m.coords[1];
          }
        } else {
          lat = Number(latInput);
          lon = Number(lonInput);
        }

        if (!lat || !lon) {
          await interaction.reply({ content: '地点の座標が見つかりませんでした。山名や座標を確認してください。', flags: (await import('../../utils/flags')).EPHEMERAL });
          return;
        }

        const point = await fetchPointWeather(lat, lon, 3);
        const embed = formatEmbed('地点予報', `座標: ${lat.toFixed(5)}, ${lon.toFixed(5)}\n近傍: 半径5km`);
        // 日別の簡易表示
        const days = point.daily?.time ?? [];
        const weatherCodeToText = (code: number | undefined) => {
          const map: Record<number, string> = {
            0: '晴れ', 1: '主に晴れ', 2: '曇り', 3: '雨', 45: '霧', 48: '霧(氷晶)',
            51: '小雨', 53: '小雨（やや強い）', 55: '小雨（強い）',
            61: '弱い雨', 63: '雨', 65: '強い雨',
            80: 'にわか雨', 81: '激しいにわか雨', 82: '非常に激しいにわか雨',
          };
          return code === undefined ? '不明' : (map[code] ?? String(code));
        };

        for (let i = 0; i < days.length; i++) {
          const dt = days[i];
          const wcode = point.daily.weathercode?.[i];
          const tmax = point.daily.temperature_2m_max?.[i];
          const tmin = point.daily.temperature_2m_min?.[i];
          const prec = point.daily.precipitation_sum?.[i];
          const v = `天気: ${weatherCodeToText(wcode)} (code: ${wcode ?? '不明'})\n最高: ${tmax ?? '不明'} ℃ 最低: ${tmin ?? '不明'} ℃\n降水量合計: ${prec ?? '不明'} mm`;
          embed.addFields({ name: dt, value: v });
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }

      // if no point inputs provided, inform user that region queries were removed
      await interaction.reply({ content: '地域（JMAの地域区分）による検索オプションは廃止しました。\n座標（lat, lon）または山名（mountain）を指定してポイント予報を取得してください。', flags: (await import('../../utils/flags')).EPHEMERAL });
    } catch (err: any) {
      log('weather_forecast error:', err);
      await interaction.reply({ content: '天気情報の取得に失敗しました。', flags: (await import('../../utils/flags')).EPHEMERAL });
    }
  },
};
