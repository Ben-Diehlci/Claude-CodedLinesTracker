// Clawd's stage: the strip in the card band where things happen while you work.
// Desktop: Svg markup with SMIL timelines, each started at the wall clock's point so a redraw carries on.
// Terminal: one row of Raster cells, repainted by the animation timer.
import { fmt, isNight } from './model'
import type { View } from './model'
import { grid, pack } from './clawd'
import type { Pose } from './clawd'
import { est, rect, text } from './draw'

export const STAGE_H = 34
/** A block on the pile is 100 of today's code lines; each full 1,000 becomes one gold column. */
export const BLOCK_LINES = 100
const BS = 7
const STEP = BS + 1
const FLOOR = STAGE_H - 3
/** The idle loop: a bug wanders in, mini Clawd catches it and walks back, later a nap by the pile. */
export const IDLE_MS = 30_000

/** Today's pile: a gold column per full 1,000 lines, then a block per 100 left over. */
export const pileOf = (today: number): { gold: number; blocks: number } => {
  const n = Math.max(0, Math.floor(today / BLOCK_LINES))

  return { gold: Math.floor(n / 10), blocks: n % 10 }
}

const num = (n: number): string => String(+n.toFixed(3))
/** Starts an animation `ms` into its run (a negative begin), or `-ms` from now when ms is negative. */
const at = (ms: number): string => ` begin="${num(-ms / 1000)}s"`

const hash = (a: number, b: number): number => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453

  return s - Math.floor(s)
}

// 3 x 5 pixel code symbols for the conveyor.
const GLYPHS: Record<string, string> = {
  '{': '.11.1.11..1..11',
  '}': '11..1..11.1.11.',
  ';': '....1.....1.1..',
  '<': '..1.1.1...1...1',
  '>': '1...1...1.1.1..',
  '/': '..1..1.1.1..1..',
  '=': '...111...111...',
  '(': '.1.1..1..1...1.',
  ')': '.1...1..1..1.1.',
}
const KEYS = Object.keys(GLYPHS)

const glyph = (ch: string, x: number, y: number, px: number): string => {
  let o = ''
  for (let i = 0; i < 15; i++) if (GLYPHS[ch][i] === '1') o += rect(x + (i % 3) * px, y + Math.floor(i / 3) * px, px, px, 'mu')

  return o
}

/** Mini Clawd (2 px squares), standing on the floor at x = 0; `flip` faces him left. */
const mini = (st: Pose, flip = false): string => {
  const px = 2
  let o = ''
  grid(st).forEach((row, y) =>
    row.forEach((c, x) => {
      if (c === 'O') o += rect(x * px, y * px, px, px, 'cf')
      else if (c === 'K') o += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}" fill="#1F1E1D"/>`
    }),
  )
  const g = flip ? `<g transform="translate(28,0) scale(-1,1)">${o}</g>` : o

  return `<g transform="translate(0,${FLOOR - 7 * px})">${g}</g>`
}

/** Two frames that swap every `ms` (walking legs). */
const flick = (a: string, b: string, ms: number): string => {
  const anim = (v: string) => `<animate attributeName="visibility" calcMode="discrete" values="${v}" dur="${num((2 * ms) / 1000)}s" repeatCount="indefinite"/>`

  return `<g>${anim('visible;hidden')}${a}</g><g visibility="hidden">${anim('hidden;visible')}${b}</g>`
}

/** Helpers for the idle loop, which starts at the wall clock's point in the loop. */
const loop = (phase: number) => {
  const dur = ` dur="${IDLE_MS / 1000}s" repeatCount="indefinite"${at(phase)}`
  const kt = (ts: number[]) => ts.map(t => (t / IDLE_MS).toFixed(4)).join(';')
  const show = (spans: [number, number][]): string => {
    const ev: [number, string][] = [[0, spans[0][0] <= 0 ? 'visible' : 'hidden']]
    for (const [a, b] of spans) {
      if (a > 0) ev.push([a, 'visible'])
      if (b < IDLE_MS) ev.push([b, 'hidden'])
    }
    ev.push([IDLE_MS, ev[ev.length - 1][1]])

    return `<animate attributeName="visibility" calcMode="discrete"${dur} keyTimes="${kt(ev.map(e => e[0]))}" values="${ev.map(e => e[1]).join(';')}"/>`
  }
  const move = (pts: [number, number][]): string => {
    const all: [number, number][] = [[0, pts[0][1]], ...pts.filter(p => p[0] > 0 && p[0] < IDLE_MS), [IDLE_MS, pts[pts.length - 1][1]]]

    return `<animateTransform attributeName="transform" type="translate"${dur} keyTimes="${kt(all.map(p => p[0]))}" values="${all.map(p => `${num(p[1])} 0`).join(';')}"/>`
  }
  const actor = (spans: [number, number][], body: string, pts?: [number, number][]) =>
    `<g visibility="hidden">${show(spans)}<g>${pts ? move(pts) : ''}${body}</g></g>`

  return { actor }
}

const zzz = (x: number, y: number): string =>
  `<text x="${x}" y="${y}" class="mu" font-size="8">z` +
  `<animateTransform attributeName="transform" type="translate" values="0 0;4 -7" dur="1.6s" repeatCount="indefinite"/>` +
  `<animate attributeName="opacity" values="1;0" dur="1.6s" repeatCount="indefinite"/></text>`

/** The stage's markup in its own coordinates (0..sw by STAGE_H); the caller places it. */
export const stageSvg = (v: View, sw: number): string => {
  const night = isNight(v.now)
  // The pile at the right end: gold columns (1,000 each) first, then 100-line blocks in columns of three.
  const pile = pileOf(v.today.code)
  const maxCols = Math.max(2, Math.floor((sw * 0.3) / STEP))
  const clayCols = Math.ceil(pile.blocks / 3)
  const golds = Math.min(pile.gold, Math.max(0, maxCols - clayCols))
  const right = sw - 6
  const left = right - (golds + clayCols) * STEP
  const pos = (i: number) => ({ x: right - (golds + Math.floor(i / 3) + 1) * STEP, y: FLOOR - ((i % 3) + 1) * STEP })
  // A faint key beside the pile, when the strip has room for it.
  const key: [string, number][] = golds + clayCols ? [['100 lines', BS], ...(pile.gold ? ([['1,000 lines', 3 * STEP - 1]] as [string, number][]) : [])] : []
  const kw = key.length ? Math.max(...key.map(([t]) => est(t, 9))) + 12 : 0
  const keyed = kw > 0 && left - kw - 8 > 110
  const end = left - 8 - (keyed ? kw : 0)

  let o = `<defs><clipPath id="stg"><rect x="1" y="1" width="${sw - 2}" height="${STAGE_H - 2}" rx="7"/></clipPath>` +
    `<clipPath id="belt"><rect x="16" y="0" width="${Math.max(0, end - 16)}" height="${STAGE_H}"/></clipPath></defs>`
  o += rect(0.5, 0.5, sw - 1, STAGE_H - 1, night ? 'tn hs' : 'hs', 8, night ? '' : 'fill="none"')
  o += rect(6, FLOOR, sw - 12, 1, 'hf')
  o += '<g clip-path="url(#stg)">'

  if (night) {
    const mx = Math.max(24, end - 12)
    o += `<path d="M${mx} 4a5 5 0 1 0 0 10a4 5 0 1 1 0-10z" class="sa"/>`
    for (let i = 0; i < 6; i++) {
      const sx = 20 + ((i * 53) % Math.max(20, mx - 40))
      o += rect(sx, 4 + ((i * 7) % 9), 1.5, 1.5, 'sa').replace('/>', `><animate attributeName="opacity" values="1;.2;1" dur="2.4s" repeatCount="indefinite"${at(i * 400)}/></rect>`)
    }
  }

  if (v.working) {
    // Code symbols ride a belt into a blinking cursor; the pattern repeats every 9 symbols, so the belt loops seamlessly.
    const gap = 13
    const period = KEYS.length * gap
    const ms = (period / 40) * 1000
    let belt = ''
    for (let k = 0; 20 + k * gap < end + period; k++) belt += glyph(KEYS[(k * 7 + 3) % KEYS.length], 20 + k * gap, 11, 2)
    o +=
      `<g clip-path="url(#belt)"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="${-period} 0" ` +
      `dur="${num(ms / 1000)}s" repeatCount="indefinite"${at(v.now % ms)}/>${belt}</g></g>`
    o += rect(9, 9, 3, 16, 'cf').replace('/>', `><animate attributeName="visibility" calcMode="discrete" values="visible;hidden" dur=".9s" repeatCount="indefinite"/></rect>`)
  } else if (end > 90) {
    const { actor } = loop(v.now % IDLE_MS)
    const napX = end - 30
    if (night || v.asleep) {
      o += actor([[0, IDLE_MS]], mini({ sleep: true, sit: true }) + zzz(26, FLOOR - 12), [[0, napX]])
    } else {
      const bx = Math.max(50, Math.min(end - 30, end * 0.55))
      const bug = (a: number, b: number) =>
        rect(0, FLOOR - 8, 10, 5, 'fg') + rect(2, FLOOR - 10, 6, 2, 'fg') + rect(a, FLOOR - 3, 2, 3, 'fg') + rect(b, FLOOR - 3, 2, 3, 'fg')
      o += actor([[3000, 14000]], flick(bug(0, 8), bug(2, 6), 140), [[3000, 24], [9000, bx + 16], [14000, bx]])
      o += actor([[10500, 14000]], flick(mini({}), mini({ legs: true }), 120), [[10500, -30], [14000, bx - 26]])
      o += actor([[14000, 14800]], mini({ armsUp: true }) + text(28, FLOOR - 12, '!', { cls: 'sa', size: 10, bold: true }), [[0, bx - 26]])
      o += actor([[14800, 19000]], flick(mini({}, true), mini({ legs: true }, true), 120), [[14800, bx - 26], [19000, -30]])
      o += actor([[22000, 28000]], mini({ sleep: true, sit: true }) + zzz(26, FLOOR - 12), [[0, napX]])
    }
  }

  // The pile; after a write the new pieces drop in (a new gold column takes the place of ten blocks).
  const flashing = v.flash > 0
  const el = v.now - v.flashAt
  const before = flashing ? pileOf(v.today.code - v.flash) : pile
  const drop = (x: number, y: number, h: number, cls: string, k: number) =>
    k < 0 || k >= 12
      ? rect(x, y, BS, h, cls, 1)
      : `<rect x="${x}" y="${-h - 2}" width="${BS}" height="${h}" rx="1" class="${cls}"><animate attributeName="y" from="${-h - 2}" to="${y}" dur=".45s" fill="freeze"${at(el - 500 - k * 120)}/></rect>`
  const goldTop = FLOOR - 3 * STEP
  const newGold = pile.gold - before.gold
  for (let g = 0; g < golds; g++) o += drop(right - (g + 1) * STEP, goldTop, 3 * STEP - 1, 'go', g - before.gold)
  for (let i = 0; i < pile.blocks; i++) {
    const p = pos(i)
    // Past a new 1,000 every leftover block is new; otherwise only those above the old count.
    o += drop(p.x, p.y, BS, 'cf', newGold > 0 ? newGold + i : i - before.blocks)
  }
  if (keyed) {
    const kx = left - kw - 4
    o += rect(kx, 8, 6, 6, 'cf', 1, 'opacity=".7"') + text(kx + 10, 14, '100 lines', { cls: 'mu', size: 9 })
    if (key.length > 1) o += rect(kx + 1, 17, 4, 12, 'go', 1, 'opacity=".7"') + text(kx + 10, 27, '1,000 lines', { cls: 'mu', size: 9 })
  }

  // The "+N" chip zips along to the pile.
  if (flashing && el < 1000) {
    const label = `+${fmt(v.flash)}`
    const cw = est(label, 10, true) + 14
    const t = at(el)
    o +=
      `<g opacity="0"><animate attributeName="opacity" values="1;1;0" keyTimes="0;.8;1" dur=".9s" fill="freeze"${t}/>` +
      `<animateTransform attributeName="transform" type="translate" from="10 0" to="${num(Math.max(10, end - cw))} 0" dur=".9s" ` +
      `calcMode="spline" keyTimes="0;1" keySplines=".2 .8 .3 1" fill="freeze"${t}/>` +
      rect(0, 9, cw, 16, 'fl', 8) +
      text(cw / 2, 21, label, { size: 10, bold: true, anchor: 'middle' }).replace('class="fg"', 'fill="#fff"') +
      `</g>`
  }

  // Milestone fireworks: three bursts over the stage.
  if (v.mile) {
    const cls = ['cf', 'go', 'pk', 'fl', 'bl']
    const elm = v.now - v.mileAt
    for (let b = 0; b < 3; b++) {
      const fx = 30 + hash(v.mileAt, b) * Math.max(10, end - 60)
      const fy = 8 + hash(b, v.mileAt) * 8
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2
        const t = at(elm - b * 250)
        o +=
          `<rect x="${num(fx)}" y="${num(fy)}" width="2" height="2" class="${cls[(i + b) % 5]}" opacity="0">` +
          `<animate attributeName="opacity" values="1;0" dur=".9s" fill="freeze"${t}/>` +
          `<animateTransform attributeName="transform" type="translate" from="0 0" to="${num(Math.cos(a) * 19)} ${num(Math.sin(a) * 11 + 4)}" dur=".9s" fill="freeze"${t}/></rect>`
      }
    }
  }

  return o + '</g>'
}

/* ---- terminal: one row of cells ---- */

const CLAY = 0xd97757
const GOLD = 0xe8b84a
const DIM = 0x8e8c84
const SAND = 0xe3c79a
const D = 0x01000000

/** What the terminal stage needs between redraws (the timer repaints it). */
export type StageLive = { working: boolean; asleep: boolean; night: boolean; blocks: number; mileUntil: number }

export const stageLive = (v: View): StageLive => ({
  working: v.working,
  asleep: v.asleep,
  night: isNight(v.now),
  blocks: Math.floor(Math.max(0, v.today.code) / BLOCK_LINES),
  mileUntil: v.mile ? v.mileAt + 4000 : 0,
})

/** The stage as `cols` Raster cells: symbols scroll while working, a bug and a tiny crab when idle, a pile at the right. */
export const stageCells = (s: StageLive, now: number, cols: number): string => {
  const line: [number, number, number][] = Array.from({ length: cols }, () => [0x20, D, D])
  const put = (x: number, ch: string, fg: number) => {
    if (x >= 0 && x < cols) line[x] = [ch.codePointAt(0)!, fg, D]
  }
  // From the right: a gold █ per 1,000 lines today, then a clay ▮ per 100.
  const golds = Math.min(6, Math.floor(s.blocks / 10))
  const piles = golds + (s.blocks % 10)
  for (let i = 0; i < piles; i++) put(cols - 1 - i, i < golds ? '█' : '▮', i < golds ? GOLD : CLAY)
  const end = cols - piles - 2

  if (s.working) {
    const off = Math.floor(now / 160)
    for (let i = 2; i < end; i += 2) put(i, '{};<>/=()'[(i + off) % 9], DIM)
    if (Math.floor(now / 450) % 2) put(0, '▌', CLAY)
  } else if (s.night || s.asleep) {
    put(0, '☾', SAND)
    if (Math.floor(now / 800) % 2) put(end - 1, 'z', DIM)
  } else {
    const t = now % IDLE_MS
    const bugX = Math.round(1 + (end * 0.6 - 1) * Math.min(1, Math.max(0, (t - 3000) / 11000)))
    if (t >= 3000 && t < 14000) put(bugX, 'ж', D)
    if (t >= 10500 && t < 14000) put(Math.round(((t - 10500) / 3500) * (bugX - 1)), '◆', CLAY)
    if (t >= 14000 && t < 14800) put(bugX, '!', SAND)
    if (t >= 14800 && t < 19000) put(Math.round((1 - (t - 14800) / 4200) * bugX), '◆', CLAY)
    if (t >= 22000 && t < 28000 && Math.floor(now / 800) % 2) put(end - 1, 'z', DIM)
  }
  if (now < s.mileUntil) for (let i = 0; i < 3; i++) if ((Math.floor(now / 200) + i) % 2) put(4 + Math.floor((i * (end - 8)) / 3), '✦', GOLD)

  return pack(line)
}
