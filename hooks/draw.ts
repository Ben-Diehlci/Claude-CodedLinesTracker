// Small drawing pieces shared by the designs: Svg markup (desktop) and text/cell helpers (terminal).
// Colors are CSS classes so one drawing follows the light or dark theme (media query inside the Svg).
import { heat } from './model'

const FONT = 'system-ui,-apple-system,Segoe UI,sans-serif'

const LIGHT = `.fg{fill:#1F1E1D}.mu{fill:#6B6A64}.cl{fill:#C6613F}.sa{fill:#A98049}.fl{fill:#4F8A3C}.go{fill:#C9921F}.bl{fill:#5565C8}.pk{fill:#D45A8A}
.hf{fill:rgba(31,30,29,.14)}.tn{fill:rgba(31,30,29,.05)}.ins{fill:rgba(31,30,29,.07)}.hs{stroke:rgba(31,30,29,.2)}.cs{stroke:#C6613F}.ss{stroke:#A98049}.ls{stroke:#4F8A3C}.fs{stroke:#1F1E1D}.bs{stroke:#5565C8}.ps{stroke:#D45A8A}.cf{fill:#C6613F}
.h1{fill:#F2D3C6}.h2{fill:#E8A88F}.h3{fill:#D97757}.h4{fill:#A84C30}.lk{opacity:.45}`
const DARK = `.fg{fill:#F5F4EE}.mu{fill:#C2C0B6}.cl{fill:#D97757}.sa{fill:#E3C79A}.fl{fill:#7FB069}.go{fill:#E8B84A}.bl{fill:#7A8CE0}.pk{fill:#E86A9A}
.hf{fill:rgba(245,244,238,.22)}.tn{fill:rgba(245,244,238,.07)}.ins{fill:rgba(245,244,238,.08)}.hs{stroke:rgba(245,244,238,.3)}.cs{stroke:#D97757}.ss{stroke:#E3C79A}.ls{stroke:#7FB069}.fs{stroke:#F5F4EE}.bs{stroke:#7A8CE0}.ps{stroke:#E86A9A}.cf{fill:#D97757}
.h1{fill:#8A4A36}.h2{fill:#B25E43}.h3{fill:#D97757}.h4{fill:#F0A383}.lk{opacity:.7}`

/** Light or dark: follow the app ('auto'), or fixed when a chosen background is light or dark. */
export type Mode = 'auto' | 'light' | 'dark'

export const theme = (mode: Mode = 'auto'): string =>
  `<style>${mode === 'dark' ? DARK : LIGHT}${mode === 'auto' ? `@media (prefers-color-scheme: dark){${DARK}}` : ''}</style>`

export const THEME = theme('auto')

export const svgDoc = (w: number, h: number, inner: string, mode: Mode = 'auto'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">${theme(mode)}${inner}</svg>`

const num = (n: number): string => String(+n.toFixed(2))

/** Rough text width, to place a chip after text (an Svg cannot measure). */
export const est = (s: string, size: number, bold = false): number => s.length * size * (bold ? 0.62 : 0.56)

type TextOpts = { cls?: string; size?: number; bold?: boolean; anchor?: 'start' | 'middle' | 'end'; spacing?: number }

export const text = (x: number, y: number, s: string, o: TextOpts = {}): string =>
  `<text x="${num(x)}" y="${num(y)}" class="${o.cls ?? 'fg'}" font-size="${o.size ?? 13}"${o.bold ? ' font-weight="700"' : ''}` +
  `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(s)}</text>`

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const rect = (x: number, y: number, w: number, h: number, cls: string, rx = 0, extra = ''): string =>
  `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${rx ? ` rx="${rx}"` : ''} class="${cls}" ${extra}/>`

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453

  return s - Math.floor(s)
}

/** A progress ring (stroke-dasharray): centre cx, cy; `cls` a stroke class (cs, ss, ls). */
export const ring = (cx: number, cy: number, r: number, frac: number, cls: string, stroke = 5): string => {
  const C = 2 * Math.PI * r

  return (
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" class="hs" stroke-width="${stroke}"/>` +
    `<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" class="${cls}" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-dasharray="${num(C * Math.min(1, frac))} ${num(C)}" transform="rotate(-90 ${num(cx)} ${num(cy)})"/>`
  )
}

/** A ring cut into slices ([value, stroke class]), clockwise from the top, with a hairline track under them. */
export const donut = (cx: number, cy: number, r: number, slices: [number, string][], stroke = 5): string => {
  const C = 2 * Math.PI * r
  const total = slices.reduce((t, [n]) => t + n, 0)
  let out = `<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" class="hs" stroke-width="${stroke}"/>`
  if (total <= 0) return out
  let at = 0
  for (const [n, cls] of slices) {
    if (n <= 0) continue
    const len = (C * n) / total
    const gap = slices.filter(x => x[0] > 0).length > 1 ? Math.min(2, len / 3) : 0
    out +=
      `<circle cx="${num(cx)}" cy="${num(cy)}" r="${r}" fill="none" class="${cls}" stroke-width="${stroke}" ` +
      `stroke-dasharray="${num(len - gap)} ${num(C)}" stroke-dashoffset="${num(-at)}" transform="rotate(-90 ${num(cx)} ${num(cy)})"/>`
    at += len
  }

  return out
}

// 3 x 5 pixel font.
const FONT3: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
}

export const pixWidth = (s: string, px: number): number => [...s].reduce((w, ch) => w + (ch === ',' ? 2 : 4) * px, 0)

/** Pixel-font digits and commas, 5 pixels tall (+1 for the comma tail). */
export const pix = (x: number, y: number, s: string, px: number, cls: string): string => {
  let cx = 0
  let out = ''
  for (const ch of s) {
    if (ch === ',') {
      out += rect(x + cx * px, y + 4 * px, px, px * 1.6, cls)
      cx += 2
      continue
    }
    const g = FONT3[ch]
    if (!g) continue
    for (let i = 0; i < 15; i++) if (g[i] === '1') out += rect(x + (cx + (i % 3)) * px, y + Math.floor(i / 3) * px, px, px, cls)
    cx += 4
  }

  return `<g shape-rendering="crispEdges">${out}</g>`
}

const FLAME = ['..R..', '.RRR.', '.RYR.', 'RRYRR', 'RYYYR', '.RRR.']

export const flame = (x: number, y: number, px = 3): string => {
  let out = ''
  FLAME.forEach((r, j) =>
    [...r].forEach((c, i) => {
      if (c !== '.') out += rect(x + i * px, y + j * px, px, px, c === 'R' ? 'cf' : 'go')
    }),
  )

  return `<g shape-rendering="crispEdges">${out}</g>`
}

/** Segmented XP bar. */
export const segments = (x: number, y: number, filled: number, total: number, sw = 9, sh = 8): string => {
  let out = ''
  for (let i = 0; i < total; i++) out += rect(x + i * (sw + 2), y, sw, sh, i < filled ? 'cf' : 'hf')

  return out
}

/** Today by hour: 24 small bars. */
export const hoursChart = (x: number, y: number, hours: number[], bw: number, h: number, nowHour: number): string => {
  const max = Math.max(1, ...hours)
  let out = ''
  hours.forEach((n, i) => {
    const bh = n ? Math.max(2, (n / max) * h) : 1
    out += rect(x + i * (bw + 1), y + h - bh, bw, bh, n ? 'cf' : 'hf', 0, i === nowHour && !n ? 'opacity=".6"' : '')
  })

  return out
}

/** Session dots: blinking = writing right now, solid = open, faint = idle. */
export const dots = (x: number, y: number, rows: { active: boolean; hot: boolean }[]): string =>
  rows
    .map((r, i) => {
      const cls = r.active ? 'cf' : 'hf'
      const blink = r.hot ? '<animate attributeName="opacity" calcMode="discrete" values="1;.35" dur="1s" repeatCount="indefinite"/>' : ''

      return `<circle cx="${x + i * 11}" cy="${y}" r="3.5" class="${cls}">${blink}</circle>`
    })
    .join('')

const dayKeyOf = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The last `n` days as rows of squares across `w` px, oldest first, today last (outlined), a little extra
 * space before each Monday so the weeks read. One row when the squares stay 11 px or more, else two rows
 * (two weeks each) so a narrow pane keeps readable squares. Returns the markup, its height and right edge.
 */
export const heatStrip = (x: number, y: number, days: Record<string, { code: number }>, now: number, w: number, n: number, gap = 3) => {
  const ms = Array.from({ length: n }, (_, k) => now - (n - 1 - k) * 86_400_000)
  const vals = ms.map(t => days[dayKeyOf(t)]?.code ?? 0)
  const max = Math.max(1, ...vals)
  const weekGap = gap * 2
  const size = (perRow: number) => {
    const breaks = ms.slice(1, perRow).filter(t => new Date(t).getDay() === 1).length
    return Math.min(26, Math.floor((w - 1 - (perRow - 1) * gap - breaks * weekGap) / perRow))
  }
  const rows = size(n) >= 11 ? 1 : 2
  const perRow = Math.ceil(n / rows)
  const cs = Math.max(6, size(perRow))
  let out = ''
  let right = 0
  for (let r = 0; r < rows; r++) {
    let cx = x
    ms.slice(r * perRow, (r + 1) * perRow).forEach((t, i) => {
      const k = r * perRow + i
      if (i > 0 && new Date(t).getDay() === 1) cx += weekGap
      const lvl = heat(vals[k], max)
      const last = k === n - 1
      const cls = (lvl ? `h${lvl}` : 'tn hs') + (last ? ' fs' : '')
      out += `<rect x="${num(cx + 0.5)}" y="${num(y + r * (cs + gap) + 0.5)}" width="${cs}" height="${cs}" rx="${cs > 14 ? 4 : 2}" class="${cls}"${last ? ' stroke-width="1.5"' : ''}/>`
      cx += cs + gap
    })
    right = Math.max(right, cx - gap)
  }

  return { svg: out, h: rows * (cs + gap) - gap + 1, right }
}

/** The same strip as terminal cells for a Raster: one row, one cell per day, a blank before each Monday. */
export const heatStripCells = (days: Record<string, { code: number }>, now: number, n: number): { cells: [number, number, number][]; columns: number } => {
  const ms = Array.from({ length: n }, (_, k) => now - (n - 1 - k) * 86_400_000)
  const vals = ms.map(t => days[dayKeyOf(t)]?.code ?? 0)
  const max = Math.max(1, ...vals)
  const shades = [0x45443f, 0x8a4a36, 0xb25e43, 0xd97757, 0xf0a383]
  const cells: [number, number, number][] = []
  ms.forEach((t, k) => {
    if (k > 0 && new Date(t).getDay() === 1) cells.push([0x20, 0x01000000, 0x01000000])
    cells.push([0x25a0, shades[heat(vals[k], max)], 0x01000000])
  })

  return { cells, columns: cells.length }
}

/** Confetti for a milestone: pieces fly out from (cx, cy) and fade. Redrawn every few seconds, so it ends by itself. */
export const confetti = (cx: number, cy: number, seed: number): string => {
  const cls = ['cf', 'go', 'pk', 'fl', 'bl']
  let out = ''
  for (let i = 0; i < 26; i++) {
    const a = hash(seed + i, 1) * Math.PI * 2
    const d = 30 + hash(seed + i, 2) * 60
    const dx = Math.cos(a) * d
    const dy = Math.sin(a) * d - 14
    out +=
      `<rect x="${num(cx)}" y="${num(cy)}" width="4" height="4" class="${cls[i % 5]}">` +
      `<animateTransform attributeName="transform" type="translate" from="0 0" to="${num(dx)} ${num(dy)}" dur="1.1s" fill="freeze"/>` +
      `<animate attributeName="opacity" from="1" to="0" dur="1.1s" fill="freeze"/></rect>`
  }

  return out
}

/* ---- terminal ---- */

/** A text bar of ▰ and ▱ (XP, code share). */
export const goalBar = (frac: number, n = 12): string => {
  const f = Math.round(Math.min(1, Math.max(0, frac)) * n)

  return '▰'.repeat(f) + '▱'.repeat(n - f)
}

const BLOCKS = ' ▁▂▃▄▅▆▇█'

export const hoursText = (hours: number[]): string => {
  const max = Math.max(1, ...hours)

  return hours.map(n => (n === 0 ? '▁' : BLOCKS[Math.max(2, Math.round((n / max) * 8))])).join('')
}
