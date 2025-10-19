import { ChatInputCommandInteraction } from 'discord.js';
import { fetchWeather, resolveArea } from '../../utils/api/jma';
import { formatEmbed } from '../../utils/format';
import { log } from '../../utils/logger';

export default {
  data: { name: 'weather_forecast' },
  async execute(interaction: ChatInputCommandInteraction) {
    const areaInput = interaction.options?.getString && interaction.options.getString('area')
      ? interaction.options.getString('area')!
      : undefined;

    try {
      const code = resolveArea(areaInput);
      const data = await fetchWeather(code);
      const desc = typeof data.summary === 'string' ? data.summary : String(data.summary);
      await interaction.reply({ embeds: [formatEmbed('天気予報', desc) as any] });
    } catch (err: any) {
      log('weather_forecast error:', err);
      await interaction.reply({ content: '天気情報の取得に失敗しました。', ephemeral: true });
    }
  },
};
