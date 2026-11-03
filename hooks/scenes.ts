// The scenes Clawd's stage plays (design/mockups-v4.html): one per 30 s window, picked by the window's seed,
// so the strip keeps changing. Idle scenes are "actors" sampled 10 times a second into SMIL (a move track,
// pose frames, a fade); working scenes are plain repeating SMIL. Each starts at the wall clock's point in its
// window, so a redraw carries on instead of restarting.
import { grid } from './clawd'
import type { Pose } from './clawd'
import { rect, text } from './draw'

export const STAGE_H = 34
export const FLOOR = STAGE_H - 3
export const SCENE_MS = 30_000
const FPS = 10
const N = (SCENE_MS / 1000) * FPS

const num = (n: number): string => String(+n.toFixed(2))
/** Starts an animation `ms` into its run (a negative begin). */
export const at = (ms: number): string => ` begin="${num(-ms / 1000)}s"`

// 3 x 5 pixel code symbols.
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
export const KEYS = Object.keys(GLYPHS)

export const glyph = (ch: string, x: number, y: number, px: number, cls = 'mu'): string => {
  let o = ''
  for (let i = 0; i < 15; i++) if (GLYPHS[ch][i] === '1') o += rect(x + (i % 3) * px, y + Math.floor(i / 3) * px, px, px, cls)

  return o
}

/** Mini Clawd (2 px squares), standing on the floor at x = 0; `flip` faces him left. */
export const mini = (st: Pose, flip = false): string => {
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

/** Two frames that swap every `ms` (walking legs, a blinking light). */
export const flick = (a: string, b: string, ms: number): string => {
  const anim = (v: string) => `<animate attributeName="visibility" calcMode="discrete" values="${v}" dur="${num((2 * ms) / 1000)}s" repeatCount="indefinite"/>`

  return `<g>${anim('visible;hidden')}${a}</g><g visibility="hidden">${anim('hidden;visible')}${b}</g>`
}

const zzz = `<text x="0" y="0" class="mu" font-size="8">z</text>`

/* ---- actors: sampled at 10 frames a second over the 30 s window ---- */

/** Where an actor is at t seconds into the window: its place, which of its drawings shows, how opaque; null = hidden. */
type Frame = { x: number; y: number; v?: number; o?: number } | null
type Actor = { vars: string[]; at: (t: number) => Frame }

const track = (a: Actor, phase: number): string => {
  const dur = ` dur="${SCENE_MS / 1000}s" repeatCount="indefinite"${at(phase)}`
  const fr: Frame[] = Array.from({ length: N + 1 }, (_, i) => a.at(i / FPS))
  let lx = 0
  let ly = 0
  const pos = fr.map(f => {
    if (f) {
      lx = f.x
      ly = f.y
    }

    return `${num(lx)} ${num(ly)}`
  })
  const kt = (i: number) => (i / N).toFixed(4)
  let out = pos.every(p => p === pos[0])
    ? `<g transform="translate(${pos[0].replace(' ', ',')})">`
    : `<g><animateTransform attributeName="transform" type="translate"${dur} values="${pos.join(';')}"/>`
  const ops = fr.map(f => f?.o ?? 1)
  if (ops.some(o => o !== 1)) out += `<animate attributeName="opacity"${dur} values="${ops.map(o => num(Math.max(0, o))).join(';')}"/>`
  a.vars.forEach((body, k) => {
    const on = fr.map(f => !!f && (f.v ?? 0) === k)
    if (!on.some(Boolean)) return
    if (on.every(Boolean)) {
      out += body
      return
    }
    const ev: [number, boolean][] = [[0, on[0]]]
    for (let i = 1; i <= N; i++) if (on[i] !== on[i - 1]) ev.push([i, on[i]])
    if (ev[ev.length - 1][0] !== N) ev.push([N, on[N]])
    out +=
      `<g visibility="hidden"><animate attributeName="visibility" calcMode="discrete"${dur} ` +
      `keyTimes="${ev.map(e => kt(e[0])).join(';')}" values="${ev.map(e => (e[1] ? 'visible' : 'hidden')).join(';')}"/>${body}</g>`
  })

  return out + '</g>'
}

const walk = (t: number): number => Math.floor(t * 5) % 2
const tri = (t: number): number => 1 - Math.abs(1 - 2 * (t - Math.floor(t)))
const bug = (a: number, b: number): string =>
  rect(0, FLOOR - 8, 10, 5, 'fg') + rect(2, FLOOR - 10, 6, 2, 'fg') + rect(a, FLOOR - 3, 2, 3, 'fg') + rect(b, FLOOR - 3, 2, 3, 'fg')
const napper = (x: number): Actor[] => [
  { vars: [mini({ sleep: true, sit: true })], at: () => ({ x, y: 0 }) },
  {
    vars: [zzz],
    at: t => {
      const z = (t % 1.6) / 1.6

      return { x: x + 26 + z * 4, y: FLOOR - 12 - z * 7, o: 1 - z }
    },
  },
]

/** Idle scenes: actors for a strip `end` px wide (the pile sits to its right). */
const IDLE: Record<string, (end: number) => Actor[]> = {
  'bug chase': end => {
    const bx1 = Math.max(50, Math.min(end - 30, end * 0.55))
    const bx = (p: number) => 40 + (Math.min(p, 5) / 5) * (bx1 - 40)
    return [
      { vars: [bug(0, 8), bug(2, 6)], at: t => (t % 10 < 5.2 ? { x: bx(t % 10), y: 0, v: walk(t) } : null) },
      {
        vars: [mini({}), mini({ legs: true }), mini({ armsUp: true }) + text(28, FLOOR - 12, '!', { cls: 'sa', size: 10, bold: true }), mini({}, true), mini({ legs: true }, true)],
        at: t => {
          const p = t % 10
          if (p >= 3.5 && p < 5.2) return { x: -30 + ((p - 3.5) / 1.7) * (bx1 + 4), y: 0, v: walk(t) }
          if (p >= 5.2 && p < 5.9) return { x: bx1 - 26, y: 0, v: 2 }
          if (p >= 5.9 && p < 8) return { x: bx1 - 26 - ((p - 5.9) / 2.1) * (bx1 + 4), y: 0, v: 3 + walk(t) }
          return null
        },
      },
    ]
  },
  nap: end => napper(end - 30),
  builder: end => {
    const carry = (legs: boolean) => mini({ armsUp: true, legs }) + rect(10, FLOOR - 21, 7, 7, 'go', 1)
    return [
      {
        vars: [carry(false), carry(true), mini({ armsUp: true }), mini({}, true), mini({ legs: true }, true)],
        at: t => {
          const p = t % 7.5
          if (p < 3.5) return { x: 10 + (p / 3.5) * (end - 50), y: 0, v: walk(t) }
          if (p < 4.2) return { x: end - 40, y: 0, v: 2 }
          if (p < 7) return { x: end - 40 - ((p - 4.2) / 2.8) * (end - 10), y: 0, v: 3 + walk(t) }
          return null
        },
      },
      {
        vars: [rect(0, 0, 7, 7, 'go', 1)],
        at: t => {
          const p = t % 7.5
          if (p < 3.5 || p >= 4.2) return null
          const k = (p - 3.5) / 0.7
          return { x: end - 30 + k * 30, y: FLOOR - 21 + k * 13 - Math.sin(k * Math.PI) * 6 }
        },
      },
    ]
  },
  butterfly: end => {
    const mx = end / 2 - 20
    const bfx = (t: number) => 10 + ((t % 7.5) / 7.5) * (end - 20)
    return [
      {
        vars: [
          rect(0, 0, 1, 4, 'fg') + rect(-4, -2, 4, 3, 'pk') + rect(1, -2, 4, 3, 'pk'),
          rect(0, 0, 1, 4, 'fg') + rect(-3, 0, 3, 4, 'pk') + rect(1, 0, 3, 4, 'pk'),
        ],
        at: t => ({ x: bfx(t), y: 10 + Math.sin(t * 3) * 5, v: walk(t) }),
      },
      {
        vars: [mini({ eyeDx: -1 }), mini({ eyeDx: 1 }), mini({ armsUp: true })],
        at: t => {
          const near = Math.abs(bfx(t) - mx - 14) < 50
          return near ? { x: mx, y: -Math.abs(Math.sin(t * 7)) * 6, v: 2 } : { x: mx, y: 0, v: bfx(t) < mx ? 0 : 1 }
        },
      },
    ]
  },
  juggling: end => {
    const cx = end / 2 - 20
    return [
      { vars: [mini({ armsUp: true }), mini({ armL: true })], at: t => ({ x: cx, y: 0, v: Math.floor(t * 4) % 2 }) },
      ...[0, 1, 2].map(i => ({
        vars: [glyph(KEYS[i * 3], 0, 0, 1.5, 'sa')],
        at: (t: number) => {
          const a = (t / 1.4 + i / 3) % 1
          return { x: cx + 8 + a * 16, y: 2 + (1 - Math.sin(a * Math.PI)) * 10 }
        },
      })),
    ]
  },
  'paper airplane': end => [
    { vars: [`<path d="M0 0l14 4l-14 4l3-4z" class="fg" opacity=".75"/>`], at: t => ({ x: -20 + ((t % 6) / 6) * (end + 40), y: 8 + Math.sin(t * 2) * 3 }) },
    { vars: [mini({ waveR: true }), mini({})], at: t => ({ x: end * 0.55, y: 0, v: Math.floor(t * 4) % 2 }) },
  ],
  sweeping: end => {
    const cx = Math.max(40, end * 0.3)
    const amp = Math.min(50, end * 0.2)
    const xOf = (t: number) => cx + Math.sin(t * 1.4) * amp
    const right = (t: number) => Math.cos(t * 1.4) > 0
    const broomR = `<line x1="26" y1="${FLOOR - 12}" x2="32" y2="${FLOOR - 1}" class="ss" stroke-width="1.5"/>` + rect(29, FLOOR - 3, 6, 3, 'sa')
    const broomL = `<line x1="2" y1="${FLOOR - 12}" x2="-4" y2="${FLOOR - 1}" class="ss" stroke-width="1.5"/>` + rect(-7, FLOOR - 3, 6, 3, 'sa')
    return [
      {
        vars: [mini({ armR: true }) + broomR, mini({ armR: true, legs: true }) + broomR, mini({ armR: true }, true) + broomL, mini({ armR: true, legs: true }, true) + broomL],
        at: t => ({ x: xOf(t), y: 0, v: (right(t) ? 0 : 2) + walk(t) }),
      },
      ...[0, 1, 2].map(i => ({
        vars: [`<circle cx="0" cy="0" r="1.8" class="mu"/>`],
        at: (t: number) => {
          const k = (t * 1.5 + i / 3) % 1
          const dir = right(t) ? 1 : -1
          return { x: xOf(t) + (dir > 0 ? 32 : -4) + dir * (4 + i * 3), y: FLOOR - 2 - k * 8, o: 0.7 - 0.7 * k }
        },
      })),
    ]
  },
  'coffee break': end => {
    const mx = end / 2 - 20
    const sip = (t: number) => t % 4 > 3
    return [
      { vars: [mini({}), mini({ armR: true, blink: true })], at: t => ({ x: mx, y: 0, v: sip(t) ? 1 : 0 }) },
      { vars: [rect(0, 0, 7, 8, 'fg', 1) + rect(7, 2, 2, 4, 'fg')], at: t => (sip(t) ? { x: mx + 22, y: FLOOR - 16 } : { x: mx + 32, y: FLOOR - 8 }) },
      ...[0, 1, 2].map(i => ({
        vars: [rect(0, 0, 1.5, 3, 'mu')],
        at: (t: number) => {
          if (sip(t)) return null
          const k = (t * 0.8 + i / 3) % 1
          return { x: mx + 34 + Math.sin(k * 6 + i) * 2, y: FLOOR - 11 - k * 10, o: 1 - k }
        },
      })),
    ]
  },
  ball: end => {
    const k = (t: number) => tri(t / 3)
    return [
      { vars: [rect(end - 38, FLOOR - 26, 2, 26, 'hf')], at: () => ({ x: 0, y: 0 }) },
      { vars: [mini({}), mini({ legs: true })], at: t => ({ x: 18, y: 0, v: k(t) < 0.08 ? 1 : 0 }) },
      { vars: [`<circle cx="0" cy="0" r="4" class="bl"/>`], at: t => ({ x: 46 + k(t) * (end - 90), y: FLOOR - 5 - Math.abs(Math.sin(t * Math.PI * 1.3)) * 14 }) },
    ]
  },
  night: end => [
    {
      vars: [`<line x1="0" y1="0" x2="-16" y2="-5" class="ss" stroke-width="1.5"/>`],
      at: t => {
        const s = t % 5
        return s < 0.8 ? { x: 40 + s * Math.min(140, end * 0.5), y: 5 + s * 12, o: 1 - s } : null
      },
    },
    {
      vars: [`<circle cx="0" cy="0" r="2" class="go"/>`, `<circle cx="0" cy="0" r="1" class="go"/>`],
      at: t => ({ x: end * 0.4 + Math.sin(t * 0.7) * Math.min(50, end * 0.2), y: 16 + Math.sin(t * 1.9) * 6, v: Math.floor(t * 3) % 2 }),
    },
    ...napper(end - 30),
  ],
}

/** Idle scene names; "night" plays after 10 pm, "nap" when Clawd is asleep. */
export const IDLE_SCENES = Object.keys(IDLE)

/* ---- working scenes: repeating SMIL ---- */

const WORK: Record<string, (end: number, now: number) => string> = {
  'code belt': (end, now) => {
    // Code symbols ride a belt into a blinking cursor; the pattern repeats every 9 symbols, so the belt loops seamlessly.
    const gap = 13
    const period = KEYS.length * gap
    const ms = (period / 40) * 1000
    let belt = ''
    for (let k = 0; 20 + k * gap < end + period; k++) belt += glyph(KEYS[(k * 7 + 3) % KEYS.length], 20 + k * gap, 11, 2)
    return (
      `<g clip-path="url(#belt)"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="${-period} 0" ` +
      `dur="${num(ms / 1000)}s" repeatCount="indefinite"${at(now % ms)}/>${belt}</g></g>` +
      cursor(9, 9, 16)
    )
  },
  'code rain': (end, now) => {
    let o = ''
    for (let c = 0; 14 + c * 15 < end - 6; c++) {
      const sp = 14 + ((c * 7) % 9)
      const ms = (48 / sp) * 1000
      const col =
        glyph(KEYS[(c * 5 + 3) % 9], 0, -10, 1.5).replace(/class="mu"/g, 'class="mu" opacity=".45"') +
        glyph(KEYS[(c * 5) % 9], 0, 0, 1.5) +
        glyph(KEYS[(c * 3) % 9], 0, 10, 1.5, 'cf')
      o +=
        `<g><animateTransform attributeName="transform" type="translate" from="${14 + c * 15} -12" to="${14 + c * 15} 36" dur="${num(ms / 1000)}s" ` +
        `repeatCount="indefinite"${at((now + (c * 11 * 1000) / sp) % ms)}/>${col}</g>`
    }
    return `<g clip-path="url(#belt)">${o}</g>`
  },
  editor: (end, now) => {
    const K = 12
    const ms = ((8 * K) / 6) * 1000
    let lines = ''
    for (let n = 0; n < 2 * K; n++) {
      const m = n % K
      const ind = ((m * 7) % 3) * 8
      const w = Math.min(end - 40 - ind, 30 + ((m * 53) % 120))
      lines += rect(18 + ind, 6 + n * 8, Math.max(10, w), 3, m % 4 === 0 ? 'sa' : 'mu', 1)
    }
    return (
      rect(10, 4, 3, STAGE_H - 8, 'hf') +
      `<g clip-path="url(#belt)"><g><animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${-8 * K}" dur="${num(ms / 1000)}s" ` +
      `repeatCount="indefinite"${at(now % ms)}/>${lines}</g></g>`
    )
  },
  treadmill: (end, now) => {
    const cx = Math.max(40, end / 2 - 6)
    const cy = STAGE_H / 2
    const r = 15
    let spokes = ''
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      spokes += `<line x1="${cx}" y1="${cy}" x2="${num(cx + Math.cos(a) * r)}" y2="${num(cy + Math.sin(a) * r)}" class="hs"/>`
    }
    return (
      `<g><animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="1.5s" repeatCount="indefinite"${at(now % 1500)}/>${spokes}</g>` +
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="ss" stroke-width="1.5"/>` +
      `<g transform="translate(${cx - 14},0)">${flick(mini({}), mini({ legs: true }), 100)}</g>`
    )
  },
  'build bar': (end, now) => {
    const bw = Math.max(60, end - 120)
    const cyc = 6000
    const t = at(now % cyc)
    const seg = (bw - 4) / 20
    let o = rect(16, 12, bw, 10, 'hs', 3, 'fill="none"')
    for (let i = 0; i < 20; i++) {
      const k = (((i + 1) / 20) * 0.9).toFixed(3)
      o += rect(18 + i * seg, 14, seg - 1.5, 6, 'cf', 1).replace('/>', ` visibility="hidden"><animate attributeName="visibility" calcMode="discrete" keyTimes="0;${k}" values="hidden;visible" dur="6s" repeatCount="indefinite"${t}/></rect>`)
    }
    // A spinner and the percentage, each a set of texts shown in turn.
    const spin = ['|', '/', '-', '\\']
      .map((c, i) => text(bw + 24, 21, c, { cls: 'mu', size: 10, bold: true }).replace('>', ` visibility="hidden"><animate attributeName="visibility" calcMode="discrete" keyTimes="0;${i / 4};${(i + 1) / 4}" values="hidden;visible;hidden" dur=".5s" repeatCount="indefinite"/>`))
      .join('')
    let pct = ''
    for (let s = 0; s <= 10; s++) {
      const a = (s / 10) * 0.9
      const b = s === 10 ? 1 : ((s + 1) / 10) * 0.9
      pct += text(bw + 34, 21, `building ${s * 10}%`, { cls: 'mu', size: 10 }).replace(
        '>',
        ` visibility="hidden"><animate attributeName="visibility" calcMode="discrete" keyTimes="0;${a.toFixed(3)};${b.toFixed(3)}" values="hidden;visible;hidden" dur="6s" repeatCount="indefinite"${t}/>`,
      )
    }
    return o + spin + pct
  },
  packets: (end, now) => {
    const screen = (x: number) =>
      rect(x, 8, 18, 14, 'fs', 2, 'fill="none"') + rect(x + 3, 11, 12, 2, 'mu') + rect(x + 3, 15, 8, 2, 'mu') + rect(x + 7, 22, 4, 4, 'fg')
    const a = 34
    const b = end - 34
    let o = screen(14) + screen(b)
    for (let i = 0; i < 3; i++) {
      const back = i === 1
      const path = back ? `M${b - 10} 12 Q${(a + b) / 2} 2 ${a} 12` : `M${a} 12 Q${(a + b) / 2} 2 ${b - 10} 12`
      o +=
        `<g>${rect(0, 0, 9, 6, back ? 'sa' : 'cf', 1)}<path d="M0 0l4.5 3.5l4.5-3.5" fill="none" class="hs"/>` +
        `<animateMotion path="${path}" dur="1.8s" repeatCount="indefinite"${at((now + i * 600) % 1800)}/></g>`
    }
    return o
  },
}

export const WORK_SCENES = Object.keys(WORK)

const cursor = (x: number, y: number, h: number): string =>
  rect(x, y, 3, h, 'cf').replace('/>', `><animate attributeName="visibility" calcMode="discrete" values="visible;hidden" dur=".9s" repeatCount="indefinite"/></rect>`)

/** A small seeded random (mulberry32). */
const seeded = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** One shuffled round of the list (every scene once), the same for every redraw of that round. */
const round = (list: readonly string[], r: number): string[] => {
  const rand = seeded(r * 7919 + list.length)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }

  return out
}

/** The scene for the 30 s window `now` falls in: each round plays every scene once in a random order, never the same twice in a row. */
export const pickScene = (list: readonly string[], now: number): string => {
  const w = Math.floor(now / SCENE_MS)
  const r = Math.floor(w / list.length)
  const cur = round(list, r)
  // A round that would open with the scene the last one ended on starts with its second instead.
  if (list.length > 1 && cur[0] === round(list, r - 1)[list.length - 1]) [cur[0], cur[1]] = [cur[1], cur[0]]

  return cur[w % list.length]
}

const DAY_SCENES = IDLE_SCENES.filter(n => n !== 'night')

/** Which scene plays now. */
export const sceneName = (o: { now: number; working: boolean; night: boolean; asleep: boolean }): string =>
  o.working ? pickScene(WORK_SCENES, o.now) : o.night ? 'night' : o.asleep ? 'nap' : pickScene(DAY_SCENES, o.now)

/** The scene's markup for a strip `end` px wide, started at the wall clock's point in its window. */
export const sceneSvg = (name: string, end: number, now: number): string => {
  if (WORK[name]) return WORK[name](end, now)
  if (!IDLE[name] || end <= 90) return ''

  return IDLE[name](end).map(a => track(a, now % SCENE_MS)).join('')
}
