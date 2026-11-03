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

/** Sums over every session on this Mac (each session writes only its own store key). */
export type Totals = {
  life: Counts
  today: Counts
  /** Lines per day, newest 30 days. */
  days: Record<string, Counts>
  /** Sessions that wrote or checked in recently, this one included. */
  sessions: number
}

/** The last write: when, and how many code lines (drives the +N flash). */
export type Pulse = { at: number; n: number }

export type Prefs = { status: boolean; pane: boolean; mascot: boolean }

declare module 'claude-code' {
  interface PluginState {
    'lines-tracker': { session: Shaped<Stats>; prefs: Shaped<Prefs>; totals: Shaped<Totals>; pulse: Shaped<Pulse> }
  }
}
