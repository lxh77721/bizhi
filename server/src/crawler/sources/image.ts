/**
 * 图片字节解析工具
 * --------------------------------------------------------------------------
 * 用途有两个，都是当前抓取链路上的真实缺口：
 *
 * 1. **真实尺寸**：多数源站不返回宽高（必应图搜直接是 null），
 *    而小程序瀑布流卡片要靠 width/height 算错落布局与占位高度。
 *    与其信源站声明，不如下载后直接读图片头。
 *
 * 2. **真实格式**：老代码把所有壁纸都写成 `.webp` + `Content-Type: image/webp`，
 *    但源站给的其实是 JPEG —— 文件后缀与内容不符，部分端上会白图。
 *    这里按文件头判断真实格式，文件名与 Content-Type 才能真正对齐。
 *
 * 只解析文件头，不依赖任何第三方库，也不解码像素。
 */

export interface ImageMeta {
  /** 真实 MIME，如 image/jpeg */
  mime: string;
  /** 推荐扩展名，如 jpg */
  ext: string;
  width: number;
  height: number;
}

/** PNG：8 字节签名 + IHDR 宽高（大端，偏移 16/20） */
function parsePng(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG：扫描 SOFn 段（0xC0-0xC3, 0xC5-0xC7, 0xC9-0xCB, 0xCD-0xCF），宽高在段内大端 */
function parseJpeg(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // 无长度字段的标记
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const segLen = buf.readUInt16BE(i + 2);
    const isSofn =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSofn) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (segLen < 2) return null;
    i += 2 + segLen;
  }
  return null;
}

/** WebP：三种子格式（VP8X / VP8L / VP8 ）宽高存放位置不同 */
function parseWebp(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);

  if (chunk === 'VP8X') {
    // 24bit 小端，存的是「实际值 - 1」
    const w = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const h = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width: w, height: h };
  }
  if (chunk === 'VP8 ') {
    // 有损：帧头里 0x9d012a 之后两个 14bit 小端
    const start = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    if (start < 0 || start + 7 > buf.length) return null;
    const w = buf.readUInt16LE(start + 3) & 0x3fff;
    const h = buf.readUInt16LE(start + 5) & 0x3fff;
    return { width: w, height: h };
  }
  if (chunk === 'VP8L') {
    // 无损：1 字节签名 0x2f 后 14bit + 14bit
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** GIF：逻辑屏幕宽高（小端，偏移 6/8） */
function parseGif(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  const sig = buf.toString('ascii', 0, 3);
  if (sig !== 'GIF') return null;
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
}

/**
 * 读取图片真实元信息。
 * 无法识别时返回 null（调用方应回退到源站声明的宽高/格式）。
 */
export function readImageMeta(buf: Buffer): ImageMeta | null {
  const decoders: Array<[ImageMeta['mime'], ImageMeta['ext'], (b: Buffer) => { width: number; height: number } | null]> = [
    ['image/jpeg', 'jpg', parseJpeg],
    ['image/png', 'png', parsePng],
    ['image/webp', 'webp', parseWebp],
    ['image/gif', 'gif', parseGif],
  ];
  for (const [mime, ext, fn] of decoders) {
    try {
      const size = fn(buf);
      if (size && size.width > 0 && size.height > 0) {
        return { mime, ext, width: size.width, height: size.height };
      }
    } catch {
      /* 换下一种格式 */
    }
  }
  return null;
}
