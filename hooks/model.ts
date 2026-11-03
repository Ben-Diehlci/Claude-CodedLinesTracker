// The numbers behind every design: plain functions, no drawing. A design only draws a View.
import type { Counts, Prefs, Row, Totals } from '../types'
import type { Outfit } from './clawd'

export const EMPTY: Counts = { all: 0, code: 0, comments: 0, blank: 0 }
export const LEVEL_LINES = 2500
export const MILESTONE = 1000
/** Weeks the heat map shows (Ben: 4 instead of 12). */
export const HEAT_WEEKS = 4

export const SECTIONS = [
  { id: 'header', label: 'Level' },
  { id: 'numbers', label: 'Details', off: true },
  { id: 'rings', label: 'Rings' },
  { id: 'heat', label: 'Heat map' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'languages', label: 'Languages' },
  { id: 'files', label: 'Files' },
  { id: 'badges', label: 'Badges' },
] as const

/** Pane backgrounds: none keeps the app's own; the others are fixed colors, light or dark, and the pane's drawings follow. */
export const BACKGROUNDS = [
  { id: 'none', label: 'App default', color: '', mode: 'auto' },
  { id: 'paper', label: 'Paper', color: '#F7F3EA', mode: 'light' },
  { id: 'sand', label: 'Sand', color: '#EFE5D3', mode: 'light' },
  { id: 'blush', label: 'Blush', color: '#F8EAE3', mode: 'light' },
  { id: 'slate', label: 'Slate', color: '#30302E', mode: 'dark' },
  { id: 'night', label: 'Night', color: '#1F1E1D', mode: 'dark' },
] as const

export const backgroundOf = (id: string) => BACKGROUNDS.find(b => b.id === id) ?? BACKGROUNDS[0]

export const OUTFIT_CHOICES = ['auto', 'none', 'party', 'shades', 'crown', 'night'] as const

export const defaultPrefs = (): Prefs => ({
  status: true,
  pane: true,
  mascot: true,
  style: 'auto',
  outfit: 'auto',
  bg: 'none',
  lookOpen: false,
  sections: Object.fromEntries(SECTIONS.map(s => [s.id, !('off' in s)])),
})

/** Older saved prefs (prefs-1 had only three toggles) keep their values; new fields get defaults. */
export const mergePrefs = (saved: Partial<Prefs> | undefined): Prefs => {
  const d = defaultPrefs()
  if (!saved) return d

  return { ...d, ...saved, sections: { ...d.sections, ...(saved.sections ?? {}) } }
}

/** A model id or alias as a short name: claude-opus-5-5 -> "Opus 5.5", sonnet -> "Sonnet". */
export const modelName = (id: string): string => {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d{1,2})(?!\d)(?:[-.](\d{1,2})(?!\d))?)?/i.exec(id)
  if (!m) return id ? id.replace(/^claude-/, '') : 'Unknown'
  const fam = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()

  return m[2] ? `${fam} ${m[2]}${m[3] ? '.' + m[3] : ''}` : fam
}

/** Ring and key colors (stroke class, fill class) by model family; "earlier" lines are the hairline grey. */
export const modelColor = (name: string): { stroke: string; fill: string } => {
  const f = name.split(' ')[0]
  if (f === 'Opus') return { stroke: 'cs', fill: 'cf' }
  if (f === 'Sonnet') return { stroke: 'ss', fill: 'sa' }
  if (f === 'Haiku') return { stroke: 'ls', fill: 'fl' }
  if (f === 'Fable') return { stroke: 'bs', fill: 'bl' }

  return { stroke: 'ps', fill: 'pk' }
}

export const fmt = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const dayKey = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const lastDays = (now: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => dayKey(now - (n - 1 - i) * 86_400_000))

export const isNight = (now: number): boolean => {
  const h = new Date(now).getHours()

  return h >= 22 || h < 5
}

export const levelOf = (lifeCode: number) => {
  const level = 1 + Math.floor(lifeCode / LEVEL_LINES)
  const into = lifeCode % LEVEL_LINES

  return { level, xp: into / LEVEL_LINES, toNext: LEVEL_LINES - into, next: level * LEVEL_LINES }
}

/** Outfit by level: LV 3 party hat, LV 5 shades, LV 7 crown; after 10 pm a nightcap. */
export const pickOutfit = (pref: string, level: number, now: number): Outfit => {
  if (pref !== 'auto') return (OUTFIT_CHOICES as readonly string[]).includes(pref) ? (pref as Outfit) : 'none'
  if (isNight(now)) return 'night'

  return level >= 7 ? 'crown' : level >= 5 ? 'shades' : level >= 3 ? 'party' : 'none'
}

/** Days in a row with code, counting back from today (or from yesterday if today is still empty), and the best run seen. */
export const streaks = (days: Record<string, Counts>, now: number): { streak: number; best: number } => {
  const keys = Object.keys(days).sort()
  let best = 0
  let run = 0
  let prev = ''
  for (const k of keys) {
    if ((days[k].code ?? 0) <= 0) {
      run = 0
      prev = ''
      continue
    }
    const t = Date.parse(k + 'T12:00:00')
    run = prev && Math.round((t - Date.parse(prev + 'T12:00:00')) / 86_400_000) === 1 ? run + 1 : 1
    prev = k
    best = Math.max(best, run)
  }
  let streak = 0
  let at = now
  if ((days[dayKey(at)]?.code ?? 0) <= 0) at -= 86_400_000
  while ((days[dayKey(at)]?.code ?? 0) > 0) {
    streak++
    at -= 86_400_000
  }

  return { streak, best: Math.max(best, streak) }
}

export const bestDay = (days: Record<string, Counts>): { day: string; code: number } | undefined => {
  let out: { day: string; code: number } | undefined
  for (const [day, c] of Object.entries(days)) if (c.code > (out?.code ?? 0)) out = { day, code: c.code }

  return out
}

export type Badge = { id: string; label: string; got: boolean }

export const badgesOf = (t: Totals, best: number): Badge[] => [
  { id: 'first', label: 'First 1,000', got: t.life.code >= 1000 },
  { id: 'streak', label: '5-day streak', got: best >= 5 },
  { id: 'owl', label: 'Night owl', got: t.owl },
  { id: 'club', label: '10k club', got: t.life.code >= 10_000 },
  { id: 'comment', label: 'Comment champ', got: t.life.comments >= 1000 },
  { id: 'poly', label: 'Polyglot (5 types)', got: t.exts >= 5 },
]

export const heat = (v: number, max: number): number => (v <= 0 ? 0 : Math.min(4, 1 + Math.floor((v / Math.max(1, max)) * 3.999)))

/** What a design needs, worked out once per draw. */
export type View = {
  now: number
  surface: string
  /** Cells the band may use (the terminal's width, or the desktop's in cells). */
  cols: number
  /** Rows a pane's body has room for (its scroll window), 0 when unknown. */
  paneRows: number
  working: boolean
  asleep: boolean
  hop: boolean
  mascot: boolean
  outfit: Outfit
  session: Counts
  today: Counts
  life: Counts
  /** Code lines of the last write while its +N chip shows, else 0. */
  flash: number
  /** When the last write landed (ms), for the stage's falling blocks. */
  flashAt: number
  /** True while the milestone confetti and glow show. */
  mile: boolean
  mileAt: number
  /** Code lines by model, biggest first: today (every session) and since tracking began, plus older lines. */
  modelsToday: [string, number][]
  modelsLife: [string, number][]
  /** Code lines today and all time from before per-model tracking (2026-11-03). */
  earlierToday: number
  earlierLife: number
  level: number
  xp: number
  toNext: number
  nextAt: number
  streak: number
  bestStreak: number
  best?: { day: string; code: number }
  hours: number[]
  rows: Row[]
  sessions: number
  badges: Badge[]
  days: Record<string, Counts>
  minutes: number
  writes: number
  edits: number
  byExt: [string, number][]
  byFile: [string, number][]
  files: number
}
