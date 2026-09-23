// 纯 Node 生成应用图标 PNG（书本图形 + 渐变圆角方块），无需任何图像库
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const inRoundRect = (px, py, cx, cy, hw, hh, r) => {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  if (dx > r || dy > r) return false;
  if (dx <= 0 || dy <= 0) return true;
  return dx * dx + dy * dy <= r * r;
};
// 旋转坐标系内的圆角矩形判定
const inRotRect = (px, py, cx, cy, hw, hh, r, deg) => {
  const a = (-deg * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  const x = dx * Math.cos(a) - dy * Math.sin(a) + cx;
  const y = dx * Math.sin(a) + dy * Math.cos(a) + cy;
  return inRoundRect(x, y, cx, cy, hw, hh, r);
};

function drawIcon(size) {
  const img = Buffer.alloc(size * size * 4);
  const S = size;
  const bg1 = [0x4f, 0x8c, 0xff], bg2 = [0x8b, 0x5c, 0xf6]; // 蓝→紫渐变
  const radius = S * 0.22;
  const put = (i, r, g, b, a) => {
    const A = a / 255, o = i * 4;
    img[o] = clamp(r * A + img[o] * (1 - A));
    img[o + 1] = clamp(g * A + img[o + 1] * (1 - A));
    img[o + 2] = clamp(b * A + img[o + 2] * (1 - A));
    img[o + 3] = clamp(Math.max(a, img[o + 3]));
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      // 背景圆角方块（2x 超采样边缘）
      let cov = 0;
      for (const [ox, oy] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        if (inRoundRect(x + ox, y + oy, S / 2, S / 2, S / 2 - 1, S / 2 - 1, radius)) cov++;
      }
      if (!cov) continue;
      const t = y / S;
      put(i, bg1[0] + (bg2[0] - bg1[0]) * t, bg1[1] + (bg2[1] - bg1[1]) * t, bg1[2] + (bg2[2] - bg1[2]) * t, (cov / 4) * 255);
      // 白色书本：左右两页 + 中缝（在渐变上叠加白色）
      const cx = S / 2, cy = S / 2 + S * 0.03;
      const pw = S * 0.13, ph = S * 0.21, tilt = 9;
      const onLeft = inRotRect(x, y, cx - S * 0.155, cy, pw, ph, pw * 0.35, tilt);
      const onRight = inRotRect(x, y, cx + S * 0.155, cy, pw, ph, pw * 0.35, -tilt);
      const onSpine = inRoundRect(x, y, cx, cy, S * 0.022, S * 0.235, S * 0.02);
      if (onLeft || onRight || onSpine) {
        // 页面上开两条“文字行”镂空
        const lx = onLeft ? cx - S * 0.155 : cx + S * 0.155;
        const line1 = inRoundRect(x, y, lx, cy - S * 0.075, S * 0.085, S * 0.014, S * 0.012);
        const line2 = inRoundRect(x, y, lx, cy - S * 0.02, S * 0.085, S * 0.014, S * 0.012);
        const line3 = inRoundRect(x, y, lx, cy + S * 0.035, S * 0.06, S * 0.014, S * 0.012);
        if (!(line1 || line2 || line3)) put(i, 255, 255, 255, 255);
      }
    }
  }
  return encodePNG(S, S, img);
}

const outDir = path.join(__dirname, '..', 'assets', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.png'), drawIcon(256));
fs.writeFileSync(path.join(outDir, 'tray.png'), drawIcon(32));
console.log('icons written');
