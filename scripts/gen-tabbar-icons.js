/**
 * 生成 tabBar 图标 PNG（零第三方依赖）
 * 用法：node scripts/gen-tabbar-icons.js
 * 输出：client/src/static/tabbar/*.png（4 图标 × 2 色 = 8 个）
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const SIZE = 81
const SS = 3 // 超采样倍数（抗锯齿）

/* ================= PNG 编码 ================= */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const encodePng = (w, h, rgba) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/* ================= SDF 图元 ================= */
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r
const sdSegment = (x, y, ax, ay, bx, by) => {
  const px = x - ax
  const py = y - ay
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - dx * t, py - dy * t)
}
const sdRoundBox = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r)
  const qy = Math.abs(y - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const inTriangle = (x, y, ax, ay, bx, by, cx, cy) => {
  const s = (x - bx) * (ay - by) - (ax - bx) * (y - by)
  const t = (x - cx) * (by - cy) - (bx - cx) * (y - cy)
  const u = (x - ax) * (cy - ay) - (cx - ax) * (y - ay)
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0)
}

/* ================= 图标定义（命中函数: (x,y)=>bool，线宽 5） ================= */
const STROKE = 5

const icons = {
  // 房子：屋顶三角描边 + 主体圆角矩形描边 + 门填充
  home: {
    hit: (x, y) => {
      const inRoof = inTriangle(x, y, 40.5, 12, 15, 37, 66, 37)
      const roofD = Math.min(
        sdSegment(x, y, 40.5, 12, 15, 37),
        sdSegment(x, y, 15, 37, 66, 37),
        sdSegment(x, y, 66, 37, 40.5, 12)
      )
      const bodyD = sdRoundBox(x, y, 40.5, 50.5, 21, 15, 5) // [19.5,61.5]x[35.5,65.5]
      const door = x >= 34 && x <= 47 && y >= 51 && y <= 66
      return (inRoof && roofD <= STROKE / 2) || Math.abs(bodyD) <= STROKE / 2 || door
    }
  },
  // 时钟：圆环 + 时针（12点）+ 分针（右上）
  history: {
    hit: (x, y) => {
      const ringD = Math.abs(Math.hypot(x - 40.5, y - 40.5) - 26)
      const h1 = sdSegment(x, y, 40.5, 40.5, 40.5, 27)
      const h2 = sdSegment(x, y, 40.5, 40.5, 55.5, 34)
      return ringD <= STROKE / 2 || h1 <= STROKE / 2 || h2 <= STROKE / 2
    }
  },
  // 柱状图：基线 + 三根圆柱描边
  stats: {
    hit: (x, y) => {
      const base = sdSegment(x, y, 13, 65, 68, 65)
      const b1 = sdRoundBox(x, y, 23, 49, 6.5, 16, 3) // y in [33,65]
      const b2 = sdRoundBox(x, y, 40.5, 40, 6.5, 25, 3) // y in [15,65]
      const b3 = sdRoundBox(x, y, 58, 55, 6.5, 10, 3) // y in [45,65]
      return base <= STROKE / 2 || Math.abs(b1) <= STROKE / 2 || Math.abs(b2) <= STROKE / 2 || Math.abs(b3) <= STROKE / 2
    }
  },
  // 人形：头部圆环 + 肩部圆弧（圆心在画布外底部，天然裁出肩线）
  profile: {
    hit: (x, y) => {
      const head = Math.abs(sdCircle(x, y, 40.5, 26, 10.5))
      const body = Math.abs(sdCircle(x, y, 40.5, 70, 19))
      return head <= STROKE / 2 || body <= STROKE / 2
    }
  }
}

/* ================= 渲染 ================= */
const render = (hitFn, r, g, b) => {
  const px = Buffer.alloc(SIZE * SIZE * 4)
  const step = 1 / SS
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let cov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (hitFn(x + (sx + 0.5) * step, y + (sy + 0.5) * step)) cov++
        }
      }
      const alpha = Math.round((cov / (SS * SS)) * 255)
      const idx = (y * SIZE + x) * 4
      px[idx] = r
      px[idx + 1] = g
      px[idx + 2] = b
      px[idx + 3] = alpha
    }
  }
  return px
}

/* ================= 主流程 ================= */
const outDir = path.join(__dirname, '..', 'src', 'static', 'tabbar')
fs.mkdirSync(outDir, { recursive: true })

const colors = {
  normal: [155, 163, 180], // #9BA3B4
  active: [91, 143, 249] // #5B8FF9
}

for (const [name, def] of Object.entries(icons)) {
  for (const [suffix, [r, g, b]] of Object.entries(colors)) {
    const file = path.join(outDir, `${name}${suffix === 'normal' ? '' : '-active'}.png`)
    fs.writeFileSync(file, encodePng(SIZE, SIZE, render(def.hit, r, g, b)))
    console.log('生成:', file)
  }
}
console.log('完成: 8 个 tabBar 图标')