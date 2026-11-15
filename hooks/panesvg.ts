// The pane's sections as Svg markup for the desktop, laid out like design/mockups-v2.html (section 3, upgraded pane).
// Each returns { h, src } for a box `w` wide; the terminal draws the same sections as text (panes.tsx).
import { clawdBody, canvasH } from './clawd'
import { donut, est, heatStrip, rect, svgDoc, text } from './draw'
import type { Mode } from './draw'
import { HEAT_WEEKS, fmt, langRows, modelColor, modelShades } from './model'
import { seenLabel } from './peers'
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

/**
 * A ring card's key: a dot and "Name 1,234" per slice, in lined-up columns (as many as fit `room`, all
 * as wide as the widest item), filled row by row; returns markup and its rows.
 */
const legend = (x: number, y: number, room: number, items: [string, number, string][]): { s: string; rows: number } => {
  let s = ''
  const labels = items.map(([name, n]) => `${name} ${fmt(n)}`)
  // One type size for the whole key: smaller only when the widest item alone would run past the card's edge.
  const widest = labels.reduce((a, l) => (l.length > a.length ? l : a), '')
  const size = fit(widest, room - 10)
  const colW = Math.max(...labels.map(l => 10 + est(l, size) + 12), 1)
  const cols = Math.max(1, Math.floor((room + 12) / colW))
  let row = 0
  items.forEach(([, , fill], i) => {
    const cx = (i % cols) * colW
    row = Math.floor(i / cols)
    s += `<circle cx="${x + cx + 3.5}" cy="${y + row * 14 - 3.5}" r="3.5" class="${fill}"/>` + text(x + cx + 10, y + row * 14, labels[i] ?? '', { cls: 'mu', size })
  })

  return { s, rows: row + 1 }
}

/** Slices for a model ring: the four biggest models, the rest as "Other", then the lines from before tracking. */
const slices = (models: [string, number][], earlier: number, earlierName: string, shades: Map<string, number>): [string, number, string, string][] => {
  const named = models.slice(0, 4).map(([m, n]) => {
    const c = modelColor(m, shades.get(m) ?? 0)

    return [m, n, c.fill, c.stroke] as [string, number, string, string]
  })
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
  // One shade per model, worked out from both cards so a model looks the same on each.
  const shades = modelShades([...v.modelsLife, ...v.modelsToday].map(([m]) => m))
  const cards = [
    { big: v.today.code, cap: 'lines today, by model', sl: slices(v.modelsToday, v.earlierToday, 'earlier', shades) },
    { big: v.life.code, cap: 'lines all time, by model', sl: slices(v.modelsLife, v.earlierLife, 'earlier', shades) },
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

/** Machine colors by slot, the same on every Mac. */
export const MACHINE_FILL = ['cf', 'bl', 'sa', 'fl']

/** One row per Mac (color dot, model name, share bar, lines today), then all time as one bar split by color. */
export const computersSvg = (v: View, w: number): Piece => {
  const ms = v.machines
  const rh = 21
  const max = Math.max(1, ...ms.map(m => m.today))
  const { barX, barW } = barsFor(w)
  let s = text(0, 10, v.countBoth ? `COMPUTERS (${ms.length > 2 ? 'ALL' : 'BOTH'} COUNTED)` : 'COMPUTERS (THIS ONE COUNTED)', TAG)
  ms.forEach((m, i) => {
    const y = 16 + i * rh + rh / 2
    const cls = MACHINE_FILL[m.slot % 4]
    s += `<circle cx="5" cy="${y}" r="4" class="${cls}"/>`
    s += text(18, y + 4.5, clip(m.name, Math.floor((barX - 26) / 7)), { cls: 'fg', size: 13 })
    s += rect(barX, y - 3, Math.max(4, barW * (m.today / max)), 6, cls, 3)
    s += text(w, y + 4.5, fmt(m.today), { cls: 'mu', size: 13, anchor: 'end' })
  })
  const y2 = 16 + ms.length * rh + 6
  const total = Math.max(1, ms.reduce((n, m) => n + m.life, 0))
  s += text(0, y2 + 10, 'ALL TIME', TAG)
  // One bar split by computer, each part with that computer's all-time number written inside it
  // (left out when the part is too narrow for it; the total sits at the right).
  const bw = Math.max(60, w - 80)
  const bh = 16
  s += `<clipPath id="cpall"><rect x="0" y="${y2 + 16}" width="${Math.round(bw)}" height="${bh}" rx="4"/></clipPath><g clip-path="url(#cpall)">`
  let x = 0
  let inside = ''
  const widths = partWidths(ms.map(m => m.life), ms.map(m => est(fmt(m.life), 11, true) + 10), bw)
  ms.forEach((m, i) => {
    const mw = widths[i] ?? 0
    s += rect(x, y2 + 16, mw, bh, MACHINE_FILL[m.slot % 4], 0)
    const n = fmt(m.life)
    // Light text on the darker fills, dark text on sand (white on sand is too faint).
    const ink = MACHINE_FILL[m.slot % 4] === 'sa' ? 'id' : 'ib'
    if (est(n, 11, true) + 10 <= mw) inside += text(x + mw / 2, y2 + 28, n, { cls: ink, size: 11, bold: true, anchor: 'middle' })
    x += mw
  })
  s += `</g>${inside}`
  s += text(w, y2 + 29, fmt(total), { cls: 'mu', size: 13, anchor: 'end' })
  const seen = ms.filter(m => !m.mine).map(m => {
    const l = seenLabel(m, v.now)

    return l === 'now' ? `${m.name} up to date` : `${m.name} last seen ${l}`
  })
  s += text(0, y2 + 50, fitTo(`Rows: lines today. ${seen.join(', ')}`, w, 11), { cls: 'mu', size: 11 })

  return piece(w, y2 + 58, s, `Computers: ${ms.map(m => `${m.name} ${fmt(m.today)} today, ${fmt(m.life)} all time`).join('; ')}`)
}

/** Row bars grow with the pane (a quarter of it, 70 to 240 px), ending 52 px before the number at the right edge. */
const barsFor = (w: number): { barX: number; barW: number } => {
  const barW = Math.round(Math.max(70, Math.min(240, w * 0.25)))

  return { barX: Math.max(120, w - barW - 52), barW }
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

/**
 * Widths of a split bar: each part in proportion to its value, but a small part is widened to fit its
 * number (`need`), taken from the bigger parts. Falls back to plain proportions when the numbers cannot all fit.
 */
export const partWidths = (vals: number[], need: number[], total: number): number[] => {
  const sum = Math.max(1, vals.reduce((a, b) => a + b, 0))
  const plain = vals.map(v => (total * v) / sum)
  if (need.reduce((a, b) => a + b, 0) > total) return plain
  const fixed = new Set<number>()
  for (let round = 0; round < vals.length; round++) {
    const free = total - [...fixed].reduce((a, i) => a + (need[i] ?? 0), 0)
    const rest = Math.max(1, vals.reduce((a, v, i) => (fixed.has(i) ? a : a + v), 0))
    const out = vals.map((v, i) => (fixed.has(i) ? (need[i] ?? 0) : (free * v) / rest))
    const short = out.findIndex((w, i) => !fixed.has(i) && w < (need[i] ?? 0))
    if (short < 0) return out
    fixed.add(short)
  }

  return plain
}

/** Cuts a line with "…" until it fits w px at that font size. */
const fitTo = (s: string, w: number, size: number): string => {
  if (est(s, size) <= w) return s
  let t = s
  while (t.length > 1 && est(t + '…', size) > w) t = t.slice(0, -1)

  return t.trimEnd() + '…'
}

/**
 * A Languages part's fill: its type's color; "other types" a full muted grey, "older, no type" the same grey
 * at half strength (the old .55 and .25 were too faint to tell apart on dark).
 */
const langFill = (slot: number): [string, string] =>
  slot >= 0 ? [LANG[slot % LANG.length] ?? 'cf', ''] : ['mu', slot === -1 ? '' : 'opacity=".5"']

/** What the key says for each Languages entry. */
const langLabel = (key: string, slot: number): string => (slot >= 0 ? `.${key}` : slot === -1 ? 'other types' : 'older, no type')

/** Code by file type: a stacked bar each for this chat, today and all time, then a table of the numbers. */
export const languagesSvg = (v: View, w: number): Piece => {
  const { named, rows } = langRows(v)
  const lx = 64
  const bw = Math.max(40, w - lx - 60)
  let s = text(0, 10, 'LANGUAGES', TAG)
  rows.forEach((r, i) => {
    const y = 20 + i * 20
    s += text(0, y + 9, r.label, { cls: 'mu', size: 12 })
    s += `<clipPath id="lb${i}"><rect x="${lx}" y="${y}" width="${bw}" height="10" rx="5"/></clipPath>`
    let bars = rect(lx, y, bw, 10, 'hf', 5)
    let x = lx
    for (const p of r.parts) {
      const pw = r.total ? (bw * p.n) / r.total : 0
      const [cls, extra] = langFill(p.slot)
      bars += rect(x, y, pw, 10, cls, 0, extra)
      x += pw
    }
    s += `<g clip-path="url(#lb${i})">${bars}</g>`
    s += text(w, y + 9, fmt(r.total), { cls: 'mu', size: 12, anchor: 'end' })
  })
  const keys = [...named.map((k, slot) => ({ key: k, slot })), { key: 'other', slot: -1 }, { key: 'earlier', slot: -2 }].filter(k =>
    rows.some(r => r.parts.some(p => p.key === k.key)),
  )
  let y = 20 + rows.length * 20 + 10
  if (keys.length === 0) {
    s += text(0, y + 4, 'nothing written yet', { cls: 'mu', size: 12 })

    return piece(w, y + 12, s, 'Languages: none yet')
  }
  const cols = [w - 136, w - 68, w]
  ;['chat', 'today', 'all time'].forEach((h, i) => (s += text(cols[i] ?? w, y, h.toUpperCase(), { ...TAG, anchor: 'end' })))
  for (const k of keys) {
    y += 17
    const [cls, extra] = langFill(k.slot)
    s += rect(0, y - 8, 8, 8, cls, 2, extra)
    s += text(14, y, clip(langLabel(k.key, k.slot), Math.floor((w - 150) / 7)), { cls: 'fg', size: 12 })
    rows.forEach((r, i) => {
      const n = r.parts.find(p => p.key === k.key)?.n ?? 0
      s += text(cols[i] ?? w, y, n ? fmt(n) : '–', { cls: 'mu', size: 12, anchor: 'end' })
    })
  }
  const alt = rows.map(r => `${r.label.toLowerCase()} ${r.parts.map(p => `${langLabel(p.key, p.slot)} ${fmt(p.n)}`).join(', ') || 'none'}`).join('; ')

  return piece(w, y + 6, s, `Languages: ${alt}`)
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
  computers: computersSvg,
  heat: heatSvg,
  sessions: sessionsSvg,
  languages: languagesSvg,
  files: filesSvg,
  badges: badgesSvg,
}
