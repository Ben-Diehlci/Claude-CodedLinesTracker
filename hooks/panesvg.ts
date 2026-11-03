// The pane's sections as Svg markup for the desktop, laid out like design/mockups-v2.html (section 3, upgraded pane).
// Each returns { h, src } for a box `w` wide; the terminal draws the same sections as text (panes.tsx).
import { clawdBody, canvasH } from './clawd'
import { donut, est, heatStrip, rect, svgDoc, text } from './draw'
import type { Mode } from './draw'
import { HEAT_WEEKS, fmt, modelColor } from './model'
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
  // A smaller Clawd in a narrow pane, so the words beside him keep their room.
  const px = w < 300 ? 4 : 6
  const ch = canvasH(v.outfit) * px
  const h = Math.max(60, ch)
  const tx = v.mascot ? 14 * px + 12 : 0
  let s = ''
  if (v.mascot) s += `<g transform="translate(0,${(h - ch) / 2})">${clawdBody(px, { working: v.working, asleep: v.asleep, hop: v.hop, outfit: v.outfit, now: v.now })}</g>`
  s += text(tx, h / 2 - 8, 'Lines Crab', { cls: 'fg', size: 16, bold: true })
  s += text(tx + est('Lines Crab', 16, true) + 6, h / 2 - 8, `LV ${v.level}`, { cls: 'mu', size: 13 })
  const full = `${fmt(v.life.code)} lifetime, ${fmt(v.toNext)} to LV ${v.level + 1}`
  const line = est(full, 12) <= w - tx ? full : `${fmt(v.toNext)} to LV ${v.level + 1}`
  s += text(tx, h / 2 + 10, line, { cls: 'mu', size: Math.min(12, fit(line, w - tx) + 1) })
  const bw = w - tx
  s += rect(tx, h / 2 + 17, bw, 6, 'hf', 3) + rect(tx, h / 2 + 17, Math.max(6, bw * v.xp), 6, 'cf', 3)

  return piece(w, h, s, `${v.mascot ? 'Clawd the pixel crab. ' : ''}Level ${v.level}, ${fmt(v.life.code)} lifetime lines, ${fmt(v.toNext)} to the next level`)
}

// Caption size: 11 px, smaller when the words would run past the room.
const fit = (s: string, room: number): number => Math.max(9, Math.min(11, Math.floor((room / (s.length * 0.56)) * 10) / 10))

/** A ring card's key: a dot and "Name 1,234" per slice, wrapping inside `room`; returns markup and its rows. */
const legend = (x: number, y: number, room: number, items: [string, number, string][]): { s: string; rows: number } => {
  let s = ''
  let cx = 0
  let row = 0
  for (const [name, n, fill] of items) {
    const label = `${name} ${fmt(n)}`
    // Smaller type when one item alone would run past the card's edge.
    const size = fit(label, room - 10)
    const iw = 10 + est(label, size) + 10
    if (cx > 0 && cx + iw > room) {
      cx = 0
      row++
    }
    s += `<circle cx="${x + cx + 3.5}" cy="${y + row * 14 - 3.5}" r="3.5" class="${fill}"/>` + text(x + cx + 10, y + row * 14, label, { cls: 'mu', size })
    cx += iw
  }

  return { s, rows: row + 1 }
}

/** Slices for a model ring: the four biggest models, the rest as "Other", then the lines from before tracking. */
const slices = (models: [string, number][], earlier: number, earlierName: string): [string, number, string, string][] => {
  const named = models.slice(0, 4).map(([m, n]) => [m, n, modelColor(m).fill, modelColor(m).stroke] as [string, number, string, string])
  const rest = models.slice(4).reduce((t, [, n]) => t + n, 0)
  if (rest > 0) named.push(['Other', rest, 'pk', 'ps'])
  if (earlier > 0) named.push([earlierName, earlier, 'hf', 'hs'])

  return named
}

/** Two hairline cards: today's code lines by model (every session), and all time by model. */
export const ringsSvg = (v: View, w: number): Piece => {
  // Two cards side by side, each at most 320 px so a wide pane does not stretch them thin;
  // one above the other when the pane is too narrow for two.
  const stacked = (w - 10) / 2 < 170
  const cw = stacked ? Math.min(320, w) : Math.min(320, (w - 10) / 2)
  const room = cw - 72
  const cards = [
    { big: v.today.code, cap: 'lines today, by model', sl: slices(v.modelsToday, v.earlierToday, 'earlier') },
    { big: v.life.code, cap: 'lines all time, by model', sl: slices(v.modelsLife, v.earlierLife, 'earlier') },
  ].map(c => ({ ...c, key: legend(0, 0, room, c.sl.map(([n, k, f]) => [n, k, f])) }))
  const ch = Math.max(64, 44 + Math.max(...cards.map(c => c.key.rows)) * 14)
  const h = stacked ? 2 * ch + 8 : ch
  let s = ''
  cards.forEach((c, i) => {
    const x = stacked ? 0 : i * (cw + 10)
    const y = stacked ? i * (ch + 8) : 0
    s += `<g transform="translate(0,${y})">`
    const caption = est(c.cap, 11) <= room ? c.cap : c.cap.replace(', by model', '')
    s +=
      `<rect x="${x + 0.5}" y="0.5" width="${cw - 1}" height="${ch - 1}" rx="10" fill="none" class="hs"/>` +
      donut(x + 32, ch / 2, 18, c.sl.map(([, n, , st]) => [n, st] as [number, string]), 6) +
      text(x + 62, 25, fmt(c.big), { cls: 'fg', size: 20, bold: true }) +
      text(x + 62, 40, caption, { cls: 'mu', size: 11 }) +
      `<g transform="translate(${x + 62},${55})">${legend(0, 0, room, c.sl.map(([n, k, f]) => [n, k, f])).s}</g></g>`
  })
  const said = (sl: [string, number, string, string][]) => sl.map(([n, k]) => `${n} ${fmt(k)}`).join(', ')

  return piece(w, h, s, `${fmt(v.today.code)} code lines today by model: ${said(cards[0].sl) || 'none yet'}. ${fmt(v.life.code)} all time: ${said(cards[1].sl)}`)
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

/**
 * Details: only what no other section shows. One bar of this session's lines split into code, comments and
 * blank (blank faint: never counted), a key, then files, writes, edits and pace on one line.
 */
export const detailsSvg = (v: View, w: number): Piece => {
  const { code, comments, blank } = v.session
  const total = code + comments + blank
  let s = text(0, 10, 'DETAILS THIS SESSION', TAG)
  s += `<clipPath id="db"><rect x="0" y="18" width="${w}" height="10" rx="5"/></clipPath>`
  let bars = rect(0, 18, w, 10, 'hf', 5)
  let x = 0
  for (const [n, cls] of [[code, 'cf'], [comments, 'sa'], [blank, 'tn hs']] as const) {
    const bw = total ? (w * n) / total : 0
    bars += rect(x, 18, bw, 10, cls)
    x += bw
  }
  s += `<g clip-path="url(#db)">${bars}</g>`
  // The key wraps to another line when a pane is too narrow for all three.
  let lx = 0
  let ly = 37
  for (const [label, cls] of [[`${fmt(code)} code`, 'cf'], [`${fmt(comments)} comments`, 'sa'], [`${fmt(blank)} blank, not counted`, 'tn hs']] as const) {
    const iw = 12 + est(label, 12)
    if (lx > 0 && lx + iw > w) {
      lx = 0
      ly += 17
    }
    s += rect(lx, ly, 8, 8, cls, 2) + text(lx + 12, ly + 8, label, { cls: 'mu', size: 12 })
    lx += iw + 12
  }
  const pace = Math.round(code / v.minutes)
  const line = `${v.files} ${v.files === 1 ? 'file' : 'files'}, ${v.writes} ${v.writes === 1 ? 'write' : 'writes'}, ${v.edits} ${v.edits === 1 ? 'edit' : 'edits'}, ${fmt(pace)} code lines a minute`
  s += text(0, ly + 29, line, { cls: 'fg', size: fit(line, w) })
  const h = ly + 39

  return piece(w, h, s, `This session: ${fmt(code)} code lines, ${fmt(comments)} comment lines, ${fmt(blank)} blank lines not counted. ${line}.`)
}

export const PANE_SVG: Record<string, (v: View, w: number) => Piece> = {
  header: headerSvg,
  numbers: detailsSvg,
  rings: ringsSvg,
  heat: heatSvg,
  sessions: sessionsSvg,
  languages: languagesSvg,
  files: filesSvg,
  badges: badgesSvg,
}
