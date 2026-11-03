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

export type Prefs = { status: boolean; pane: boolean; mascot: boolean }

declare module 'claude-code' {
  interface PluginState {
    'lines-tracker': { session: Shaped<Stats>; prefs: Shaped<Prefs> }
  }
}
