// Clawd, our own pixel drawing (the real Claude mascot cannot be animated by a mod).
// Pure functions: a pose in, cells (terminal Raster) or markup (desktop Svg) out.

export const CLAY = 0xd97757
export const EYE = 0x1f1e1d
export const SAND = 0xe3c79a
export const FLASH = 0x7fb069
export const DIM = 0x9c9a92
export const LINE = 0x45443f
const HEART = 0xe86a6a
const PINK = 0xe86a9a
const GOLD = 0xe8b84a
const BLUE = 0x7a8ce0
const WHITE = 0xf5f4ee
const DEFAULT = 0x01000000 // the terminal's own color

/** The pixel canvas: 14 wide (a spare column each side for the dance); 8 tall, 10 with a hat (hop and sit room). */
export const W = 14

/**
 * Outfits: rows drawn above his head (hat), and rows laid over his body (face and body pieces; only
 * the letters replace, dots leave him as he is). Body rows: 0 top, 1-2 eyes (2 has the arms), 3 belly, 4-5 legs.
 * Letters: P pink, Y gold, B blue, R red, L green, T brown, K black, N grey, E light grey, G mid grey
 * (no pure white: it vanishes on a light background).
 */
type Look = { hat: string[]; over?: Record<number, string> }
const LOOKS = {
  none: { hat: [] },
  party: { hat: ['......P.....', '.....PPP....'] },
  shades: { hat: [], over: { 1: '..KKKKKKKK..', 2: '...KK..KK...' } },
  crown: { hat: ['..Y..YY..Y..', '..YYYYYYYY..'] },
  night: { hat: ['....BBBBBBE.', '..BBBBBBBB..'] },
  tophat: { hat: ['...NNNNNN...', '.NNNNNNNNNN.'] },
  cowboy: { hat: ['....TTTT....', 'TTTTTTTTTTTT'] },
  beanie: { hat: ['.....E......', '...RRRRRR...'] },
  cap: { hat: ['...BBBBBB...', '..BBBBBBBBBB'] },
  chef: { hat: ['...GEEEEG...', '...GEEEEG...'] },
  propeller: { hat: ['..YYY.YYY...', '.....R......'] },
  flower: { hat: ['........P...', '.......PYP..'] },
  headphones: { hat: ['...NNNNNN...', '..N......N..'], over: { 1: '.N........N.' } },
  bow: { hat: ['.......P.P..', '........P...'] },
  wizard: { hat: ['.....BY.....', '...BBBBBB...'] },
  viking: { hat: ['.E........E.', '..EYYYYYYE..'] },
  halo: { hat: ['...YYYYYY...', '............'] },
  santa: { hat: ['.......RRE..', '..RRRRRRR...'] },
  bandana: { hat: ['..........R.', '..RRRRRRRRR.'] },
  mustache: { hat: [], over: { 3: '....KKKK....' } },
  bowtie: { hat: [], over: { 3: '....RRRR....' } },
  scarf: { hat: [], over: { 3: '..LLLLLLLL..', 4: '..L.........' } },
} satisfies Record<string, Look>

export type Outfit = keyof typeof LOOKS
export const OUTFITS = Object.keys(LOOKS) as Outfit[]
const look = (o: Outfit): Look => LOOKS[o] ?? LOOKS.none

/** Canvas height in pixels for an outfit. */
export const canvasH = (o: Outfit = 'none'): number => look(o).hat.length + 8
/** Terminal size: two pixels per cell row. */
export const cellRows = (o: Outfit = 'none'): number => canvasH(o) / 2

export type Pose = {
  blink?: boolean
  sleep?: boolean
  legs?: boolean
  eyeDx?: number
  waveR?: boolean
  armsUp?: boolean
  armL?: boolean
  armR?: boolean
  kb?: boolean
  sit?: boolean
  hop?: boolean
  dx?: number
  heart?: boolean
  bang?: boolean
  note?: boolean
  /** Facing the other way (the spin). */
  flip?: boolean
  /** Ducked this many pixels down, below the canvas's edge (the peek). */
  duck?: number
  sneeze?: boolean
}

// O body, K eye, . empty (P pink, Y gold, B blue, W white are hats).
const BASE = [
  '..OOOOOOOO..',
  '..OKOOOOKO..',
  'OOOKOOOOKOOO',
  '..OOOOOOOO..',
  '..O.O..O.O..',
  '..O.O..O.O..',
]
const LEGS_B = '...O.O..O.O.'

const sprite = (st: Pose, outfit: Outfit): string[][] => {
  const b = look(outfit).hat.length
  let m = [...look(outfit).hat, ...BASE].map(r => r.split(''))
  if (st.legs) m[b + 5] = LEGS_B.split('')
  const ex = st.eyeDx ?? 0
  for (const y of [1, 2]) {
    m[b + y][3] = 'O'
    m[b + y][8] = 'O'
    m[b + y][3 + ex] = 'K'
    m[b + y][8 + ex] = 'K'
  }
  if (st.blink || st.sleep) {
    m[b + 1][3 + ex] = 'O'
    m[b + 1][8 + ex] = 'O'
  }
  for (const [row, line] of Object.entries(look(outfit).over ?? {})) {
    ;[...line].forEach((c, x) => {
      if (c !== '.') m[b + Number(row)][x] = c
    })
  }
  const left = st.armsUp || st.armL
  const right = st.armsUp || st.waveR || st.armR
  if (left) {
    m[b + 2][0] = '.'
    m[b + 2][1] = '.'
    m[b + 1][0] = 'O'
    m[b + 1][1] = 'O'
  }
  if (right) {
    m[b + 2][10] = '.'
    m[b + 2][11] = '.'
    m[b + 1][10] = 'O'
    m[b + 1][11] = 'O'
  }
  if (st.sit) m = m.slice(0, b + 5)

  return m
}

/** The pose as a W x canvasH grid of '.', 'O', 'K', hat letters and 'G' (keyboard). */
export const grid = (st: Pose, outfit: Outfit = 'none'): string[][] => {
  const h = canvasH(outfit)
  const g = Array.from({ length: h }, () => Array<string>(W).fill('.'))
  const dx = 1 + (st.dx ?? 0)
  const dy = (st.hop ? 0 : st.sit ? 2 : 1) + (st.duck ?? 0)
  sprite(st, outfit).forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== '.' && y + dy < h) g[y + dy][x + dx] = c
    }),
  )
  if (st.kb && !st.sit) for (let x = 3; x < 11; x++) g[h - 1][x + dx - 1] = 'G'
  if (st.flip) g.forEach(r => r.reverse())

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
          : st.sneeze
            ? { ch: '*', color: SAND }
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
  stretch: {
    ms: 1800,
    pose: t => ({ armsUp: t > 300 && t < 1500, hop: t > 600 && t < 1200, blink: t > 300 && t < 1500 }),
  },
  spin: { ms: 1400, pose: t => ({ flip: Math.floor(t / 170) % 2 === 1, legs: Math.floor(t / 100) % 2 === 1 }) },
  peek: {
    ms: 3200,
    pose: t => ({
      duck: t < 400 ? Math.floor(t / 100) + 1 : t < 2800 ? 4 : Math.max(0, 4 - Math.floor((t - 2800) / 100)),
      eyeDx: t > 900 && t < 2600 ? (Math.floor(t / 500) % 2 ? 1 : -1) : 0,
    }),
  },
  sneeze: {
    ms: 2000,
    pose: t => (t < 700 ? { sit: true, blink: true } : t < 1400 ? { armsUp: true, blink: true, hop: t < 900, sneeze: true } : {}),
  },
  scuttle: {
    ms: 2200,
    pose: t => ({ dx: Math.floor(t / 550) % 2 ? 1 : -1, legs: Math.floor(t / 140) % 2 === 1 }),
  },
}
const NAMES = Object.keys(TRICKS)
export const HOP_MS = 900
export const SLEEP_MS = 5 * 60_000
/** After 10 pm Clawd dozes off sooner. */
export const NIGHT_SLEEP_MS = 2 * 60_000

const hopPose = (left: number): Pose =>
  left > 0 ? { hop: Math.floor(left / 150) % 2 === 1, armsUp: true } : {}

/** While Claude works, every other 3 s Clawd types on a tiny keyboard. */
const typing = (t: number): Pose =>
  Math.floor(t / 3000) % 2 === 1
    ? { armL: Math.floor(t / 160) % 2 === 0, armR: Math.floor(t / 160) % 2 === 1, kb: true, legs: false }
    : {}

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
    ...(a.working ? typing(now) : {}),
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

const COLORS: Record<string, number> = { K: EYE, P: PINK, Y: GOLD, B: BLUE, W: WHITE, G: DIM, R: 0xe05a4f, L: FLASH, T: 0x9a6b3f, N: 0x6b6a64, E: 0xd3d1c7 }
const color = (c: string) => COLORS[c] ?? CLAY

/** Clawd as Raster `cells`: W columns by cellRows(outfit) rows. */
export const clawdCells = (st: Pose, outfit: Outfit = 'none'): string => {
  const g = grid(st, outfit)
  const mk = mark(st)
  const cells: [number, number, number][] = []
  for (let r = 0; r < cellRows(outfit); r++) {
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

type Opts = { working: boolean; asleep: boolean; hop: boolean; outfit?: Outfit; now?: number }

/** A small seeded random (mulberry32): the same 90 s window always picks the same tricks. */
const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const TRICKS_PER_LOOP = 6

/**
 * The 90 s of poses a band Svg plays. The tricks and their times come from the wall-clock 90 s window,
 * so every redraw inside one window draws the same timeline (and clawdBody starts it at the window's
 * current point): a redraw no longer restarts the loop before a trick is reached.
 */
const timeline = (o: Opts): { pose: Pose; from: number; to: number }[] => {
  const picks: { name: string; at: number }[] = []
  if (!o.working && !o.asleep) {
    const rand = seeded(Math.floor((o.now ?? 0) / LOOP_MS))
    const slot = LOOP_MS / TRICKS_PER_LOOP
    for (let i = 0; i < TRICKS_PER_LOOP; i++) {
      const name = NAMES[Math.floor(rand() * NAMES.length)]
      const room = slot - 3000 - TRICKS[name].ms
      picks.push({ name, at: i * slot + 3000 + rand() * room })
    }
  }
  const out: { pose: Pose; from: number; to: number }[] = []
  let last = ''
  for (let t = 0; t < LOOP_MS; t += STEP_MS) {
    let st: Pose = {
      blink: !o.asleep && t % 4000 < 160,
      legs: o.working && Math.floor(t / 250) % 2 === 1,
      sleep: o.asleep,
      ...(o.working ? typing(t) : {}),
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

/** A pose letter's color as #rrggbb. */
export const pixelHex = (c: string): string => hex(color(c))

/**
 * A pixel grid as one path per letter, each run of the same letter in a row one rectangle: far smaller
 * than a rect per pixel (the app refuses an Svg over 128 KB, and a band holds many poses).
 */
export const pixelPaths = (g: string[][], px: number, paint: (c: string) => string): string => {
  const by = new Map<string, string>()
  g.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const c = row[x]
      let e = x + 1
      while (e < row.length && row[e] === c) e++
      if (c !== '.') by.set(c, (by.get(c) ?? '') + `M${x * px} ${y * px}h${(e - x) * px}v${px}h${-(e - x) * px}z`)
      x = e
    }
  })

  return [...by].map(([c, d]) => `<path d="${d}" ${paint(c)}/>`).join('')
}

const drawPose = (st: Pose, px: number, outfit: Outfit): string => {
  let s = pixelPaths(grid(st, outfit), px, c => `fill="${hex(color(c))}"`)
  const mk = mark(st)
  if (mk) {
    s += `<text x="${(W - 1.6) * px}" y="${px * 1.7}" fill="${hex(mk.color)}" font-size="${px * 1.7}" font-family="monospace">${mk.ch}</text>`
  }

  return s
}

/** Clawd's drawing and its whole animation timeline (SMIL, no script, no timer), for placing inside a bigger Svg. */
export const clawdBody = (px: number, o: Opts): string => {
  const outfit = o.outfit ?? 'none'
  const segs = timeline(o)
  const by = new Map<string, { pose: Pose; spans: [number, number][] }>()
  for (const s of segs) {
    const k = JSON.stringify(s.pose)
    if (!by.has(k)) by.set(k, { pose: s.pose, spans: [] })
    by.get(k)!.spans.push([s.from, s.to])
  }
  // Start at the current point of the wall-clock window, so a redraw carries on instead of restarting.
  // A hop (just wrote) plays from the start, where the timeline puts it.
  const phase = o.hop || o.now === undefined ? 0 : o.now % LOOP_MS
  const begin = phase ? ` begin="-${(phase / 1000).toFixed(2)}s"` : ''
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
      `repeatCount="indefinite"${begin} keyTimes="${times}" values="${vals}"/>${drawPose(pose, px, outfit)}</g>`
  }

  return body
}

/** A pixel-art Clawd as its own SVG. */
export const clawdSvg = (px: number, o: Opts): string => {
  const h = canvasH(o.outfit ?? 'none')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * px}" height="${h * px}" viewBox="0 0 ${W * px} ${h * px}" shape-rendering="crispEdges">${clawdBody(px, o)}</svg>`
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
