// The pane's sections as Svg markup for the desktop, laid out like design/mockups-v2.html (section 3, upgraded pane).
// Each returns { h, src } for a box `w` wide; the terminal draws the same sections as text (panes.tsx).
import { clawdBody, canvasH } from './clawd'
import { est, heatStrip, rect, ring, svgDoc, text } from './draw'
import type { Mode } from './draw'
import { HEAT_WEEKS, fmt } from './model'
import type { View } from './model'

export type Piece = { h: number; src: string; alt: string }

const TAG = { cls: 'mu', size: 10, bold: true, spacing: 1.2 } as const
const LANG = ['cf', 'sa', 'bl', 'fl', 'pk']

// Set once per pane draw: light, dark, or following the app.
let mode: Mode = 'auto'
export const setMode = (m: Mode) => {
  mode = m
}

const piece = (w: number, h: number, inner: string, alt: string): Piece => ({ h, src: svgDoc(w, h, inner, mode), alt })

const when = (day: string): string =>
  new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Clawd in his outfit, "Lines Crab LV n", lifetime and lines to the next level, an XP bar. */
export const headerSvg = (v: View, w: number): Piece => {
  const px = 6
  const ch = canvasH(v.outfit) * px
  const h = Math.max(60, ch)
  const tx = v.mascot ? 14 * px + 12 : 0
  let s = ''
  if (v.mascot) s += `<g transform="translate(0,${(h - ch) / 2})">${clawdBody(px, { working: v.working, asleep: v.asleep, hop: v.hop, outfit: v.outfit })}</g>`
  s += text(tx, h / 2 - 8, 'Lines Crab', { cls: 'fg', size: 16, bold: true })
  s += text(tx + est('Lines Crab', 16, true) + 6, h / 2 - 8, `LV ${v.level}`, { cls: 'mu', size: 13 })
  s += text(tx, h / 2 + 10, `${fmt(v.life.code)} lifetime, ${fmt(v.toNext)} to LV ${v.level + 1}`, { cls: 'mu', size: 12 })
  const bw = w - tx
  s += rect(tx, h / 2 + 17, bw, 6, 'hf', 3) + rect(tx, h / 2 + 17, Math.max(6, bw * v.xp), 6, 'cf', 3)

  return piece(w, h, s, `${v.mascot ? 'Clawd the pixel crab. ' : ''}Level ${v.level}, ${fmt(v.life.code)} lifetime lines, ${fmt(v.toNext)} to the next level`)
}

// Caption size: 11 px, smaller when the words would run past the card's edge.
const fit = (s: string, room: number): number => Math.max(9, Math.min(11, Math.floor((room / (s.length * 0.56)) * 10) / 10))

/** Two hairline cards: code share of this session, and today toward the goal. */
export const ringsSvg = (v: View, w: number): Piece => {
  const h = 64
  // Two cards side by side, each at most 320 px so a wide pane does not stretch them thin.
  const cw = Math.min(320, (w - 10) / 2)
  const share = v.session.all ? v.session.code / v.session.all : 0
  const room = cw - 66
  // Full captions when they fit, else a shorter pair (the ring already shows the share).
  const words = (wide: [string, string], narrow: [string, string]): [string, string] =>
    est(wide[0], 11) <= room && est(wide[1], 11) <= room ? wide : narrow
  const card = (x: number, frac: number, ringCls: string, big: string, bigCls: string, [l1, l2]: [string, string]) =>
    `<rect x="${x + 0.5}" y="0.5" width="${cw - 1}" height="${h - 1}" rx="10" fill="none" class="hs"/>` +
    ring(x + 32, h / 2, 18, frac, ringCls) +
    text(x + 60, 27, big, { cls: bigCls, size: 20, bold: true }) +
    text(x + 60, 42, l1, { cls: 'mu', size: fit(l1, room) }) +
    text(x + 60, 55, l2, { cls: 'mu', size: fit(l2, room) })
  const s =
    card(0, share, 'cs', fmt(v.session.code), 'cl', words(['code lines this session', `${Math.round(share * 100)}% of all lines`], ['code lines', 'this session'])) +
    card(
      cw + 10,
      v.goalFrac,
      v.goalFrac >= 1 ? 'ls' : 'ss',
      fmt(v.today.code),
      'fg',
      words([`lines today, goal ${fmt(v.goal)}`, v.sessions > 1 ? 'all sessions' : 'this Mac'], ['lines today', `goal ${fmt(v.goal)}`]),
    )

  return piece(w, h, s, `${fmt(v.session.code)} code lines this session, ${Math.round(share * 100)}% of all lines; ${fmt(v.today.code)} of ${fmt(v.goal)} today`)
}

/** 12-week heat map, then the streak and busiest day. */
export const heatSvg = (v: View, w: number): Piece => {
  // One row of the last 4 weeks across the pane's width (Ben: horizontal, to save height).
  const n = HEAT_WEEKS * 7
  const strip = heatStrip(0, 16, v.days, v.now, w, n)
  const start = new Date(v.now - (n - 1) * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const first = `${v.streak}-day streak (best ${v.bestStreak}).`
  const second = v.best ? `Busiest day: ${when(v.best.day)}, ${fmt(v.best.code)} lines.` : ''
  const note = second ? `${first} ${second}` : first
  // One line when it fits, else the busiest day goes on a line of its own.
  const lines = est(note, 12) <= w ? [note] : [first, second]
  const top = 16 + strip.h
  const h = top + 14 + lines.length * 16
  const s =
    text(0, 10, `LAST ${HEAT_WEEKS} WEEKS`, TAG) +
    strip.svg +
    text(0, top + 11, start, { cls: 'mu', size: 10 }) +
    text(strip.right, top + 11, 'today', { cls: 'mu', size: 10, anchor: 'end' }) +
    lines.map((l, i) => text(0, top + 14 + 14 + i * 16, l, { cls: 'mu', size: 12 })).join('')

  return piece(w, h, s, `Lines per day, last ${HEAT_WEEKS} weeks. ${note}`)
}

/** One row per open session: a dot (blinking while it writes), the project, a bar, today's lines. */
export const sessionsSvg = (v: View, w: number): Piece => {
  const rows = v.rows.length ? v.rows : [{ name: 'this session', code: v.session.code, active: true, hot: false }]
  const rh = 21
  const h = 16 + rows.length * rh
  const max = Math.max(1, ...rows.map(r => r.code))
  const { barX, barW } = barsFor(w)
  let s = text(0, 10, 'SESSIONS RIGHT NOW', TAG)
  rows.forEach((r, i) => {
    const y = 16 + i * rh + rh / 2
    const blink = r.hot ? '<animate attributeName="opacity" calcMode="discrete" values="1;.35" dur="1s" repeatCount="indefinite"/>' : ''
    s += `<circle cx="5" cy="${y}" r="4" class="${r.active ? 'cf' : 'hf'}">${blink}</circle>`
    s += text(18, y + 4.5, clip(r.name, Math.floor((barX - 26) / 7)), { cls: 'fg', size: 13 })
    s += rect(barX, y - 3, Math.max(4, barW * (r.code / max)), 6, 'sa', 3)
    s += text(w, y + 4.5, fmt(r.code), { cls: 'mu', size: 13, anchor: 'end' })
  })

  return piece(w, h, s, `Sessions right now: ${rows.map(r => `${r.name} ${fmt(r.code)}`).join(', ')}`)
}

/** Row bars grow with the pane (a quarter of it, 70 to 240 px), ending 52 px before the number at the right edge. */
const barsFor = (w: number): { barX: number; barW: number } => {
  const barW = Math.round(Math.max(70, Math.min(240, w * 0.25)))

  return { barX: Math.max(120, w - barW - 52), barW }
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

/** One stacked bar of this session's code by file type, and a legend. */
export const languagesSvg = (v: View, w: number): Piece => {
  const total = v.byExt.reduce((n, [, c]) => n + c, 0)
  const h = 48
  let s = text(0, 10, 'LANGUAGES', TAG)
  s += `<clipPath id="lb"><rect x="0" y="18" width="${w}" height="10" rx="5"/></clipPath>`
  let x = 0
  let bars = rect(0, 18, w, 10, 'hf', 5)
  v.byExt.forEach(([, n], i) => {
    const bw = total ? (w * n) / total : 0
    bars += rect(x, 18, bw, 10, LANG[i % LANG.length])
    x += bw
  })
  s += `<g clip-path="url(#lb)">${bars}</g>`
  let lx = 0
  v.byExt.forEach(([ext, n], i) => {
    const label = `.${ext} ${fmt(n)}`
    s += rect(lx, 37, 8, 8, LANG[i % LANG.length], 2) + text(lx + 12, 45, label, { cls: 'mu', size: 12 })
    lx += 12 + est(label, 12) + 12
  })
  if (!v.byExt.length) s += text(0, 45, 'nothing written yet this session', { cls: 'mu', size: 12 })

  return piece(w, h, s, `Languages: ${v.byExt.map(([e, n]) => `.${e} ${fmt(n)}`).join(', ') || 'none yet'}`)
}

/** The biggest files this session, as rows like the sessions list. */
export const filesSvg = (v: View, w: number): Piece => {
  const rh = 21
  const rows = v.byFile
  const h = 16 + Math.max(1, rows.length) * rh
  const max = Math.max(1, ...rows.map(([, n]) => n))
  const { barX, barW } = barsFor(w)
  let s = text(0, 10, 'BIGGEST FILES', TAG)
  rows.forEach(([path, n], i) => {
    const y = 16 + i * rh + rh / 2
    s += text(0, y + 4.5, clip(path.split('/').pop() ?? path, Math.floor((barX - 8) / 7)), { cls: 'fg', size: 13 })
    s += rect(barX, y - 3, Math.max(4, barW * (n / max)), 6, 'cf', 3)
    s += text(w, y + 4.5, fmt(n), { cls: 'mu', size: 13, anchor: 'end' })
  })
  if (!rows.length) s += text(0, 16 + rh / 2 + 4.5, 'nothing written yet this session', { cls: 'mu', size: 12 })

  return piece(w, h, s, `Biggest files: ${rows.map(([p, n]) => `${p.split('/').pop()} ${fmt(n)}`).join(', ') || 'none yet'}`)
}

/** Badges as pills: earned in clay, locked faded. */
export const badgesSvg = (v: View, w: number): Piece => {
  const ph = 20
  let x = 0
  let y = 18
  let s = ''
  for (const b of v.badges) {
    const pw = est(b.label, 11) + 18
    if (x > 0 && x + pw > w) {
      x = 0
      y += ph + 6
    }
    s +=
      `<g${b.got ? '' : ' class="lk"'}>` +
      `<rect x="${x + 0.5}" y="${y + 0.5}" width="${pw - 1}" height="${ph - 1}" rx="${ph / 2}" class="tn ${b.got ? 'cs' : 'hs'}"/>` +
      text(x + pw / 2, y + 14, b.label, { cls: b.got ? 'cl' : 'fg', size: 11, anchor: 'middle' }) +
      `</g>`
    x += pw + 6
  }
  const h = y + ph + 1

  return piece(w, h, text(0, 10, 'BADGES', TAG) + s, `Badges: ${v.badges.map(b => `${b.label} ${b.got ? 'earned' : 'locked'}`).join(', ')}`)
}

export const PANE_SVG: Record<string, (v: View, w: number) => Piece> = {
  header: headerSvg,
  rings: ringsSvg,
  heat: heatSvg,
  sessions: sessionsSvg,
  languages: languagesSvg,
  files: filesSvg,
  badges: badgesSvg,
}
