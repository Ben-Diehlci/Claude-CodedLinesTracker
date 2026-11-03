// Clawd, our own pixel drawing (the real Claude mascot cannot be animated by a mod).
// Pure functions: a pose in, cells (terminal Raster) or markup (desktop Svg) out.

export const CLAY = 0xd97757
export const EYE = 0x1f1e1d
export const SAND = 0xe3c79a
export const FLASH = 0x7fb069
export const DIM = 0x9c9a92
export const LINE = 0x45443f
const HEART = 0xe86a6a
const DEFAULT = 0x01000000 // the terminal's own color

/** The pixel canvas: 14 wide (a spare column each side for the dance), 8 tall (hop and sit room). */
export const W = 14
export const H = 8
/** Terminal size: two pixels per cell row. */
export const CELL_ROWS = H / 2

export type Pose = {
  blink?: boolean
  sleep?: boolean
  legs?: boolean
  eyeDx?: number
  waveR?: boolean
  armsUp?: boolean
  sit?: boolean
  hop?: boolean
  dx?: number
  heart?: boolean
  bang?: boolean
  note?: boolean
}

// O body, K eye, . empty.
const BASE = [
  '..OOOOOOOO..',
  '..OKOOOOKO..',
  'OOOKOOOOKOOO',
  '..OOOOOOOO..',
  '..O.O..O.O..',
  '..O.O..O.O..',
]
const LEGS_B = '...O.O..O.O.'

const sprite = (st: Pose): string[][] => {
  let m = BASE.map(r => r.split(''))
  if (st.legs) m[5] = LEGS_B.split('')
  const ex = st.eyeDx ?? 0
  for (const y of [1, 2]) {
    m[y][3] = 'O'
    m[y][8] = 'O'
    m[y][3 + ex] = 'K'
    m[y][8 + ex] = 'K'
  }
  if (st.blink || st.sleep) {
    m[1][3 + ex] = 'O'
    m[1][8 + ex] = 'O'
  }
  const up = (l: boolean, r: boolean) => {
    if (l) {
      m[2][0] = '.'
      m[2][1] = '.'
      m[1][0] = 'O'
      m[1][1] = 'O'
    }
    if (r) {
      m[2][10] = '.'
      m[2][11] = '.'
      m[1][10] = 'O'
      m[1][11] = 'O'
    }
  }
  if (st.armsUp) up(true, true)
  if (st.waveR) up(false, true)
  if (st.sit) m = m.slice(0, 5)

  return m
}

/** The pose as a W x H grid of '.', 'O' and 'K'. */
export const grid = (st: Pose): string[][] => {
  const g = Array.from({ length: H }, () => Array<string>(W).fill('.'))
  const dx = 1 + (st.dx ?? 0)
  const dy = st.hop ? 0 : st.sit ? 2 : 1
  sprite(st).forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== '.') g[y + dy][x + dx] = c
    }),
  )

  return g
}

/** The one-glyph marker beside Clawd, if the pose has one. */
export const mark = (st: Pose): { ch: string; color: number } | undefined =>
  st.sleep
    ? { ch: 'z', color: DIM }
    : st.heart
      ? { ch: '♥', color: HEART }
      : st.bang
        ? { ch: '!', color: SAND }
        : st.note
          ? { ch: '♪', color: SAND }
          : undefined

/** Tricks from the mockup: ms long, and the pose t ms in. */
export const TRICKS: Record<string, { ms: number; pose: (t: number) => Pose }> = {
  'look around': { ms: 1800, pose: t => ({ eyeDx: t < 600 ? -1 : t < 1200 ? 1 : 0 }) },
  wave: { ms: 1600, pose: t => ({ waveR: Math.floor(t / 250) % 2 === 0 }) },
  dance: {
    ms: 2400,
    pose: t => {
      const k = Math.floor(t / 250) % 4

      return { dx: k === 1 ? -1 : k === 3 ? 1 : 0, legs: k % 2 === 1, note: true }
    },
  },
  'double hop': { ms: 1100, pose: t => ({ hop: Math.floor(t / 180) % 3 === 0, armsUp: true }) },
  'sit down': { ms: 2600, pose: t => ({ sit: true, blink: t > 900 && t < 1500 }) },
  love: { ms: 1800, pose: () => ({ armsUp: true, heart: true }) },
  surprised: { ms: 1200, pose: t => ({ bang: true, hop: t < 200 }) },
  scuttle: {
    ms: 2200,
    pose: t => ({ dx: Math.floor(t / 550) % 2 ? 1 : -1, legs: Math.floor(t / 140) % 2 === 1 }),
  },
}
const NAMES = Object.keys(TRICKS)
export const HOP_MS = 900
export const SLEEP_MS = 5 * 60_000

const hopPose = (left: number): Pose =>
  left > 0 ? { hop: Math.floor(left / 150) % 2 === 1, armsUp: true } : {}

/* ---- live animation (terminal): one small state, stepped by a timer ---- */

export type Anim = {
  working: boolean
  asleep: boolean
  hopUntil: number
  trick: string | null
  trickAt: number
  nextTrick: number
}

const gap = () => 20_000 + Math.random() * 40_000

export const newAnim = (now: number): Anim => ({
  working: false,
  asleep: false,
  hopUntil: 0,
  trick: null,
  trickAt: 0,
  nextTrick: now + gap(),
})

/** Steps the animation to `now` and returns the pose to draw. */
export const frame = (a: Anim, now: number): Pose => {
  let st: Pose = {
    blink: !a.asleep && now % 4000 < 160,
    legs: a.working && Math.floor(now / 250) % 2 === 1,
    sleep: a.asleep,
    ...hopPose(a.hopUntil - now),
  }
  const idle = !a.working && !a.asleep && now >= a.hopUntil
  if (idle && !a.trick && now >= a.nextTrick) {
    a.trick = NAMES[Math.floor(Math.random() * NAMES.length)]
    a.trickAt = now
    a.nextTrick = now + TRICKS[a.trick].ms + gap()
  }
  if (a.trick) {
    const t = now - a.trickAt
    if (!idle || t > TRICKS[a.trick].ms) a.trick = null
    else st = { ...st, ...TRICKS[a.trick].pose(t) }
  }

  return st
}

/* ---- terminal: cells for a Raster, two pixels per cell (half blocks) ---- */

const b64 = (u8: Uint8Array): string => {
  const bytes = u8 as Uint8Array & { toBase64?: () => string }
  if (bytes.toBase64) return bytes.toBase64()
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < u8.length; i += 3) {
    const n = (u8[i] << 16) | ((u8[i + 1] ?? 0) << 8) | (u8[i + 2] ?? 0)
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63]
    out += i + 1 < u8.length ? chars[(n >> 6) & 63] : '='
    out += i + 2 < u8.length ? chars[n & 63] : '='
  }

  return out
}

export const pack = (cells: [number, number, number][]): string => {
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((c, i) => words.set(c, i * 3))

  return b64(new Uint8Array(words.buffer))
}

const color = (c: string) => (c === 'K' ? EYE : CLAY)

/** Clawd as Raster `cells`: W columns by CELL_ROWS rows. */
export const clawdCells = (st: Pose): string => {
  const g = grid(st)
  const mk = mark(st)
  const cells: [number, number, number][] = []
  for (let r = 0; r < CELL_ROWS; r++) {
    for (let x = 0; x < W; x++) {
      const top = g[2 * r][x]
      const bot = g[2 * r + 1][x]
      if (r === 0 && x === W - 1 && mk) cells.push([mk.ch.codePointAt(0)!, mk.color, DEFAULT])
      else if (top === '.' && bot === '.') cells.push([0x20, DEFAULT, DEFAULT])
      else if (bot === '.') cells.push([0x2580, color(top), DEFAULT])
      else if (top === '.') cells.push([0x2584, color(bot), DEFAULT])
      else cells.push([0x2580, color(top), color(bot)])
    }
  }

  return pack(cells)
}

const LEVELS = [0x20, 0x2581, 0x2582, 0x2583, 0x2584, 0x2585, 0x2586, 0x2587, 0x2588]

/** One column per value, `rows` cell rows tall, eighth-block heights; the last value in clay. */
export const sparkCells = (values: number[], rows: number): string => {
  const max = Math.max(1, ...values)
  const cells: [number, number, number][] = []
  for (let r = 0; r < rows; r++) {
    values.forEach((v, i) => {
      const h = v === 0 ? 0.5 : Math.max(1, (v / max) * rows * 8)
      const fill = Math.max(0, Math.min(8, Math.round(h - (rows - 1 - r) * 8)))
      const fg = i === values.length - 1 ? CLAY : v === 0 ? LINE : SAND
      cells.push([LEVELS[v === 0 && r === rows - 1 ? 1 : fill], fg, DEFAULT])
    })
  }

  return pack(cells)
}

/* ---- desktop: Svg markup; the animation is a SMIL timeline inside it ---- */

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')
export const LOOP_MS = 90_000
const STEP_MS = 50

type Opts = { working: boolean; asleep: boolean; hop: boolean }

/** The 90 s of poses a band Svg plays, tricks at random times (reshuffled on every redraw). */
const timeline = (o: Opts): { pose: Pose; from: number; to: number }[] => {
  const picks: { name: string; at: number }[] = []
  if (!o.working && !o.asleep) {
    const slot = LOOP_MS / 4
    for (let i = 0; i < 4; i++) {
      const name = NAMES[Math.floor(Math.random() * NAMES.length)]
      const room = slot - 3000 - TRICKS[name].ms
      picks.push({ name, at: i * slot + 3000 + Math.random() * room })
    }
  }
  const out: { pose: Pose; from: number; to: number }[] = []
  let last = ''
  for (let t = 0; t < LOOP_MS; t += STEP_MS) {
    let st: Pose = {
      blink: !o.asleep && t % 4000 < 160,
      legs: o.working && Math.floor(t / 250) % 2 === 1,
      sleep: o.asleep,
      ...(o.hop ? hopPose(HOP_MS - t) : {}),
    }
    const p = picks.find(k => t >= k.at && t < k.at + TRICKS[k.name].ms)
    if (p) st = { ...st, ...TRICKS[p.name].pose(t - p.at) }
    const key = JSON.stringify(st)
    if (key === last) out[out.length - 1].to = t + STEP_MS
    else out.push({ pose: st, from: t, to: t + STEP_MS })
    last = key
  }

  return out
}

const drawPose = (st: Pose, px: number): string => {
  let s = ''
  grid(st).forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== '.') s += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="${hex(color(c))}"/>`
    }),
  )
  const mk = mark(st)
  if (mk) {
    s += `<text x="${(W - 1.6) * px}" y="${px * 1.7}" fill="${hex(mk.color)}" font-size="${px * 1.7}" font-family="monospace">${mk.ch}</text>`
  }

  return s
}

/** A pixel-art Clawd as SVG with its whole animation timeline (SMIL, no script, no timer). */
export const clawdSvg = (px: number, o: Opts): string => {
  const segs = timeline(o)
  const by = new Map<string, { pose: Pose; spans: [number, number][] }>()
  for (const s of segs) {
    const k = JSON.stringify(s.pose)
    if (!by.has(k)) by.set(k, { pose: s.pose, spans: [] })
    by.get(k)!.spans.push([s.from, s.to])
  }
  let body = ''
  for (const { pose, spans } of by.values()) {
    const ev: [number, string][] = [[0, spans[0][0] === 0 ? 'visible' : 'hidden']]
    for (const [a, b] of spans) {
      if (a > 0) ev.push([a, 'visible'])
      if (b < LOOP_MS) ev.push([b, 'hidden'])
    }
    ev.push([LOOP_MS, ev[ev.length - 1][1]])
    const times = ev.map(([t]) => +(t / LOOP_MS).toFixed(5)).join(';')
    const vals = ev.map(([, v]) => v).join(';')
    body +=
      `<g visibility="hidden"><animate attributeName="visibility" calcMode="discrete" dur="${LOOP_MS / 1000}s" ` +
      `repeatCount="indefinite" keyTimes="${times}" values="${vals}"/>${drawPose(pose, px)}</g>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * px}" height="${H * px}" viewBox="0 0 ${W * px} ${H * px}" shape-rendering="crispEdges">${body}</svg>`
}

/** A 30-day sparkline as SVG (pane). */
export const sparkSvg = (values: number[], w: number, h: number): string => {
  const max = Math.max(1, ...values)
  const bw = w / values.length
  const bars = values
    .map((v, i) => {
      const bh = v ? Math.max(2, (v / max) * h) : 1
      const fill = i === values.length - 1 ? CLAY : v ? SAND : LINE

      return `<rect x="${(i * bw).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" fill="${hex(fill)}"/>`
    })
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`
}
