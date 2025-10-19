import { ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { generateStaticMap } from '../../utils/api/map';
import { log } from '../../utils/logger';
import axios from 'axios';

export default {
  data: { name: 'map_route' },
  async execute(interaction: ChatInputCommandInteraction) {
    try {
  // 複数マーカーをサポート: 'markers' はセミコロン区切りの lat,lon ペア
  // 例: markers: "35.36,138.72;35.37,138.73"  path: "lat1,lon1;lat2,lon2;lat3,lon3"
      const markersStr = interaction.options?.getString && interaction.options.getString('markers') ? interaction.options.getString('markers')! : undefined;
      const pathStr = interaction.options?.getString && interaction.options.getString('path') ? interaction.options.getString('path')! : undefined;
  const zoomStr = interaction.options?.getString && interaction.options.getString('zoom') ? interaction.options.getString('zoom')! : undefined;
  const sizeStr = interaction.options?.getString && interaction.options.getString('size') ? interaction.options.getString('size')! : undefined;
  const colorStr = interaction.options?.getString && interaction.options.getString('color') ? interaction.options.getString('color')! : undefined;
  const weightStr = interaction.options?.getString && interaction.options.getString('weight') ? interaction.options.getString('weight')! : undefined;

      const zoom = zoomStr ? Number(zoomStr) : 12;
      const size = sizeStr ?? '800x600';

      const parsePoints = (s?: string) => {
        if (!s) return [] as [number, number][];
        return s.split(';').map(p => {
          const [la, lo] = p.split(',').map(x => x.trim());
          return [Number(la), Number(lo)] as [number, number];
        }).filter(([a, b]) => !Number.isNaN(a) && !Number.isNaN(b));
      };

      let markerPoints = parsePoints(markersStr);
      let pathPoints = parsePoints(pathStr);

  // GPX 添付ファイルが提供されていれば処理します
      const gpxAttachment = interaction.options?.getAttachment && interaction.options.getAttachment('gpx') ? interaction.options.getAttachment('gpx') : undefined;
      if (gpxAttachment && gpxAttachment.url) {
        try {
          const resp = await axios.get(gpxAttachment.url, { responseType: 'text', timeout: 10000 });
          const xml = resp.data as string;
          let parsed: any = null;
          try {
            const { XMLParser } = await import('fast-xml-parser');
            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
            parsed = parser.parse(xml);
          } catch (e) {
            // fast-xml-parser がインストールされていないか失敗した場合は正規表現によるフォールバックを行います
          }

          const gpxPts: { lat: number; lon: number; time?: string }[] = [];
          if (parsed && parsed.gpx) {
            // Normalize to array of trk -> trkseg -> trkpt
            const trks = Array.isArray(parsed.gpx.trk) ? parsed.gpx.trk : (parsed.gpx.trk ? [parsed.gpx.trk] : []);
            for (const trk of trks) {
              const trksegs = Array.isArray(trk.trkseg) ? trk.trkseg : (trk.trkseg ? [trk.trkseg] : []);
              for (const seg of trksegs) {
                const pts = Array.isArray(seg.trkpt) ? seg.trkpt : (seg.trkpt ? [seg.trkpt] : []);
                for (const pt of pts) {
                  const lat = Number(pt['@_lat'] ?? pt.lat);
                  const lon = Number(pt['@_lon'] ?? pt.lon);
                  const time = pt.time ?? pt['time'];
                  if (!Number.isNaN(lat) && !Number.isNaN(lon)) gpxPts.push({ lat, lon, time });
                }
              }
            }
          } else {
            // フォールバック: 単純な正規表現でパースします
            const matches = Array.from(xml.matchAll(/<trkpt\s+lat="([0-9.\-]+)"\s+lon="([0-9.\-]+)"(?:[^>]*)>([\s\S]*?)<\/trkpt>/g));
            for (const m of matches) {
              const lat = Number(m[1]);
              const lon = Number(m[2]);
              const inner = m[3] || '';
              const tmatch = inner.match(/<time>([^<]+)<\/time>/);
              const time = tmatch ? tmatch[1] : undefined;
              if (!Number.isNaN(lat) && !Number.isNaN(lon)) gpxPts.push({ lat, lon, time });
            }
          }

          // sort by time if present, otherwise keep order
          if (gpxPts.length) {
            const hasTime = gpxPts.some(p => !!p.time);
            if (hasTime) gpxPts.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
            const coords = gpxPts.map(p => [p.lat, p.lon] as [number, number]);
            pathPoints = pathPoints.concat(coords);
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      if (markerPoints.length === 0 && pathPoints.length === 0) {
        await interaction.reply({ content: 'markers または path のいずれかを指定してください。形式: "lat,lon;lat2,lon2"', flags: (await import('../../utils/flags')).EPHEMERAL });
        return;
      }

      // center on first marker or first path point
      const center = markerPoints[0] ?? pathPoints[0];
      const markers = markerPoints.map(m => ({ lat: m[0], lon: m[1], icon: 'red-pushpin' }));

  const pathOptions = { color: colorStr, weight: weightStr ? Number(weightStr) : undefined };
  const url = generateStaticMap(center, zoom, size, markers, pathPoints.length ? pathPoints : undefined, pathOptions);

      // cache key = hash of URL
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha1').update(url).digest('hex');
      const cacheDir = (await import('path')).join(__dirname, '..', '.cache', 'maps');
      const fs = await import('fs');
      try {
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      } catch (_) {}
      const cachePath = (await import('path')).join(cacheDir, `${hash}.png`);
      try {
        if (fs.existsSync(cachePath)) {
          const buf = fs.readFileSync(cachePath);
          const attachment = new AttachmentBuilder(buf, { name: `map_${hash}.png` });
          await interaction.reply({ files: [attachment] });
          return;
        }
        // try primary
        let finalBuffer: Buffer | null = null;
        try {
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
          finalBuffer = Buffer.from(res.data);
        } catch (primaryErr) {
          // try secondary (Wikimedia staticmap endpoint) as a fallback
          try {
            const altUrl = url.replace('staticmap.openstreetmap.de/staticmap.php', 'maps.wikimedia.org/staticmap.php');
            log('map_route primary failed, trying secondary:', altUrl);
            const res2 = await axios.get(altUrl, { responseType: 'arraybuffer', timeout: 10000 });
            finalBuffer = Buffer.from(res2.data);
            // update url and cache hash to reflect the actual source
            const crypto = await import('crypto');
            const newHash = crypto.createHash('sha1').update(altUrl).digest('hex');
            // overwrite cachePath to the secondary's hash
            const newCachePath = (await import('path')).join((await import('path')).dirname(cachePath), `${newHash}.png`);
            try { fs.writeFileSync(newCachePath, finalBuffer); } catch (_) { }
            const attachment2 = new AttachmentBuilder(finalBuffer, { name: `map_${newHash}.png` });
            await interaction.reply({ files: [attachment2] });
            return;
          } catch (secondaryErr) {
            // let outer catch handle by logging primaryErr
            throw primaryErr;
          }
        }

        if (finalBuffer) {
          const buffer = finalBuffer;
          // write cache
          try { fs.writeFileSync(cachePath, buffer); } catch (e) { /* ignore cache write errors */ }
          const attachment = new AttachmentBuilder(buffer, { name: `map_${hash}.png` });
          await interaction.reply({ files: [attachment] });
        }
      } catch (e: any) {
        // better diagnostics for network/DNS errors and provide a usable fallback (the URL)
        log('map_route download error:', e);
        const errCode = e?.code ?? (e?.response?.status ? `HTTP_${e.response.status}` : 'UNKNOWN');
        const errMsg = e?.message ?? String(e);
        const safeUrl = url ?? '(生成に失敗しました)';
        // try to create a shortened URL for convenience
        let shortUrl = safeUrl;
        try {
          const tiny = await axios.post('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(safeUrl));
          if (tiny && tiny.data) shortUrl = String(tiny.data);
        } catch (_) { /* ignore shortening errors */ }

        const embed = {
          title: '地図画像の取得に失敗しました',
          description: `原因: ${errCode} - ${errMsg}`,
          fields: [
            { name: '画像URL', value: `[こちらを開く](${shortUrl})` }
          ]
        };
        try {
          await interaction.reply({ embeds: [embed as any], ephemeral: true });
        } catch (replyErr) {
          log('map_route reply error:', replyErr);
        }
      }
    } catch (err: any) {
      log('map_route error:', err);
      await interaction.reply({ content: '地図の生成に失敗しました。', ephemeral: true });
    }
  },
};
