import axios from 'axios';
import { AttachmentBuilder } from 'discord.js';

/**
 * 画像 URL を取得し、Content-Type が image/* の場合に { attachment, filename } を返します。
 * 失敗した場合や画像でないコンテンツの場合は undefined を返します。
 */
export default async function fetchImageAttachment(url: string): Promise<{ attachment: AttachmentBuilder; filename: string } | undefined> {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10_000, maxContentLength: 5 * 1024 * 1024 });
    const ct = res.headers['content-type'] as string | undefined;
    if (!ct || !ct.startsWith('image/')) return undefined;
    const ext = ct.split('/')[1]?.split(';')[0] ?? 'jpg';
    const filename = `image.${ext}`;
    const att = new AttachmentBuilder(Buffer.from(res.data), { name: filename });
    return { attachment: att, filename };
  } catch (e) {
    return undefined;
  }
}
