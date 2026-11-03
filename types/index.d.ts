export type Counts = {
  /** Non-blank lines, comments included. */
  all: number
  /** Non-blank lines that are not comments. */
  code: number
  /** Comment lines. */
  comments: number
  /** Blank lines (skipped from all and code). */
  blank: number
}

export type Stats = {
  total: Counts
  writes: number
  edits: number
  /** Code lines per file extension. */
  byExt: Record<string, number>
  /** All non-blank lines per file path. */
  byFile: Record<string, number>
  startedAt: number
}

/** One open session in the "sessions right now" list. */
export type Row = {
  /** The project folder the session started in. */
  name: string
  /** Code lines this session wrote today. */
  code: number
  /** Wrote lines within the last 30 minutes (this session always counts). */
  active: boolean
  /** Wrote within the last 15 seconds (the blinking dot). */
  hot: boolean
}

/** Sums over every session on this Mac (each session writes only its own store key). */
export type Totals = {
  life: Counts
  today: Counts
  /** Lines per day, newest 120 days. */
  days: Record<string, Counts>
  /** Code lines per hour of today (24 numbers). */
  hours: number[]
  /** Sessions that wrote lines in the last 30 minutes, at least 1 (this one). */
  sessions: number
  /** Open sessions that wrote today, plus this one, busiest first. */
  list: Row[]
  /** Any line ever written after 10 pm (the Night owl badge). */
  owl: boolean
  /** How many different file types were ever written (the Polyglot badge). */
  exts: number
  /** Code lines today per model ("Opus 5.5"), every session. */
  modelsToday: Record<string, number>
  /** Code lines per model since tracking began (2026-11-03); life.code less their sum came before. */
  modelsLife: Record<string, number>
}

/** The last write: when, how many code lines (the +N flash), and when a 1,000 milestone was crossed. */
export type Pulse = { at: number; n: number; mile: number }

export type Prefs = {
  status: boolean
  pane: boolean
  mascot: boolean
  /** Band design id: auto, classic, card, arcade or compact. */
  style: string
  /** Clawd's outfit: auto (a new one each day, some days none; nightcap after 10 pm), none, or one by name (clawd.ts LOOKS). */
  outfit: string
  /** Pane background id: none (the app's own), paper, sand, blush, slate or night. */
  bg: string
  /** On a filled pane: whether the settings are shown (below the pane), or tucked behind one Settings button. */
  lookOpen: boolean
  /** Pane sections switched on or off, by section id. */
  sections: Record<string, boolean>
}

declare module 'claude-code' {
  interface PluginState {
    'lines-tracker': { session: Shaped<Stats>; prefs: Shaped<Prefs>; totals: Shaped<Totals>; pulse: Shaped<Pulse> }
  }
}
