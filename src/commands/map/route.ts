import { ChatInputCommandInteraction } from 'discord.js';
import { generateStaticMap } from '../../utils/api/map';
import { log } from '../../utils/logger';

export default {
  data: { name: 'map_route' },
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      const latStr = interaction.options?.getString && interaction.options.getString('lat');
      const lonStr = interaction.options?.getString && interaction.options.getString('lon');

      const lat = latStr ? Number(latStr) : 35.681236; // 東京駅
      const lon = lonStr ? Number(lonStr) : 139.767125;

      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        await interaction.reply({ content: '座標が不正です。', ephemeral: true });
        return;
      }

      const url = generateStaticMap([lat, lon]);
      await interaction.reply({ content: `静的地図: ${url}` });
    } catch (err: any) {
      log('map_route error:', err);
      await interaction.reply({ content: '地図の生成に失敗しました。', ephemeral: true });
    }
  },
};
