// Claude Code cloud sessions run in a container that is gone when the session ends, so the mod never sees
// their Write and Edit calls. What they leave behind is git commits: every commit a cloud session makes ends
// with a "Claude-Session: https://claude.ai/code/session_..." trailer (and "Co-Authored-By: Claude <model>").
// This file reads those commits out of `git log` and adds their lines up, as one more "computer": Cloud.
import type { Counts } from '../types'
import { countLines, extOf } from './count'
import { EMPTY, dayKey, modelName } from './model'
import type { PeerFile } from './peers'

export const CLOUD_ID = 'claude-cloud'
export const CLOUD_NAME = 'Cloud'
export const CLOUD_MODES = ['all', 'picked', 'off'] as const
export type CloudMode = (typeof CLOUD_MODES)[number]

/** How often the repos are asked for new cloud commits (one chat does it for all, through the store). */
export const SCAN_MS = 5 * 60_000
/** How often the home folder is searched again for repos (mode "all"). */
export const FIND_MS = 60 * 60_000
/** Commits whose patches are read per git call (each call's output is capped at 4 MiB). */
export const BATCH = 100

const SESSION = /^Claude-Session:\s*(https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+)/gim
const MODEL = /^Co-Authored-By:\s*Claude\s+([^<\n]+?)\s*</im

/** For `git log --grep`: the commits a cloud session made. */
export const GREP = '^Claude-Session: https://claude\\.ai/code/session_'

// Record separator before each commit, unit separator between its fields: neither appears in a commit message.
const RS = '\x1e'
const US = '\x1f'
export const FORMAT = `--format=${RS}%H${US}%at${US}%B${US}`

/** The git arguments that list the cloud commits of a repo (hashes only). */
export const listArgs = (repo: string): string[] => [
  'git', '-C', repo, 'log', '--all', '--no-merges', '-E', '-i', `--grep=${GREP}`, '--format=%H',
]

/** The git arguments that print the given commits with their added lines. */
export const showArgs = (repo: string, hashes: string[]): string[] => [
  'git', '-C', repo, '-c', 'core.quotepath=off', 'log', '--no-walk=unsorted', FORMAT,
  '-p', '--unified=0', '--no-color', '--no-ext-diff', '--no-renames', '--no-textconv', ...hashes,
]

/** Files written by tools, not by Claude: lock files and minified or generated output. */
const GENERATED = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum|flake\.lock)$|\.(min\.js|min\.css|map)$/
export const isGenerated = (path: string): boolean => GENERATED.test(path)

/** One cloud commit as the store keeps it: small, no file names or code. */
export type CloudCommit = {
  /** Commit time, ms. */
  at: number
  /** The cloud session's id (the end of its URL). */
  s: string
  /** Model, "Opus 5.5" ('' when the commit does not say). */
  m: string
  /** A squash: the message carries more than one session trailer (GitHub's "Squash and merge"). */
  q: boolean
  /** A fingerprint of the added lines: the same change twice (a rebase or cherry-pick) counts once. */
  k: string
  c: Counts
  /** Code lines per file extension. */
  x: Record<string, number>
  /** The repo it was found in. */
  r: string
}

/** FNV-1a, 32 bits, as hex: enough to tell patches apart. */
const fnv = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return (h >>> 0).toString(16)
}

const addC = (a: Counts, b: Counts): Counts => ({ all: a.all + b.all, code: a.code + b.code, comments: a.comments + b.comments, blank: a.blank + b.blank })

/** The commits in `git log FORMAT -p --unified=0` output, keyed by hash. */
export const parseLog = (out: string, repo: string): Record<string, CloudCommit> => {
  const commits: Record<string, CloudCommit> = {}
  for (const chunk of out.split(RS)) {
    const parts = chunk.split(US)
    if (parts.length < 4) continue
    const hash = (parts[0] ?? '').trim()
    const at = parts[1] ?? '0'
    const body = parts[2] ?? ''
    const diff = parts.slice(3).join(US)
    const sessions = [...body.matchAll(SESSION)].map(m => m[1])
    const first = sessions[0]
    if (!/^[0-9a-f]{7,64}$/.test(hash) || !first) continue
    const model = MODEL.exec(body)?.[1]
    const files: Record<string, string[]> = {}
    let path = ''
    // Headers come before a file's first hunk; inside hunks a line "+++ x" is an added line, not a header.
    let hunk = false
    for (const line of diff.split('\n')) {
      if (line.startsWith('diff --git ')) {
        path = ''
        hunk = false
      } else if (!hunk && line.startsWith('+++ ')) path = line === '+++ /dev/null' ? '' : line.slice(4).replace(/^b\//, '')
      else if (line.startsWith('@@')) hunk = true
      else if (hunk && line.startsWith('+') && path && !isGenerated(path)) (files[path] ??= []).push(line.slice(1))
    }
    let c: Counts = { ...EMPTY }
    const x: Record<string, number> = {}
    const print: string[] = []
    for (const p of Object.keys(files).sort()) {
      const text = (files[p] ?? []).join('\n')
      const ext = extOf(p)
      const n = countLines(text, ext)
      c = addC(c, n)
      if (n.code > 0) x[ext] = (x[ext] ?? 0) + n.code
      print.push(`${p}\n${text}`)
    }
    commits[hash] = {
      at: Number(at) * 1000,
      s: first.replace(/^.*\/session_/, 'session_'),
      m: model ? modelName(model) : '',
      q: sessions.length > 1,
      k: fnv(print.join('\n\0')),
      c,
      x,
      r: repo,
    }
  }

  return commits
}

/**
 * The commits that count, once each: the same patch twice (rebased, cherry-picked, or a one-commit squash)
 * counts once, and a squash commit is dropped when the commits it squashed are still in a repo.
 */
export const countable = (commits: CloudCommit[]): CloudCommit[] => {
  const sorted = [...commits].sort((a, b) => a.at - b.at || a.k.localeCompare(b.k))
  const plain = new Set(sorted.filter(c => !c.q).map(c => c.s))
  const seen = new Set<string>()
  const out: CloudCommit[] = []
  for (const c of sorted) {
    if (c.c.all === 0 || seen.has(c.k)) continue
    if (c.q && plain.has(c.s)) continue
    seen.add(c.k)
    out.push(c)
  }

  return out
}

/** Cloud lines in the shape another computer leaves in the synced folder, so they merge the same way. */
export const cloudTotals = (commits: CloudCommit[], now: number): PeerFile & { sessions: number; commits: number } => {
  const today = dayKey(now)
  let life: Counts = { ...EMPTY }
  const days: Record<string, Counts> = {}
  const hours: number[] = Array(24).fill(0)
  const modelsToday: Record<string, number> = {}
  const modelsLife: Record<string, number> = {}
  const extsLife: Record<string, number> = {}
  const extsToday: Record<string, number> = {}
  const sessions = new Set<string>()
  let last = 0
  const use = countable(commits)
  for (const c of use) {
    const d = dayKey(c.at)
    life = addC(life, c.c)
    days[d] = addC(days[d] ?? EMPTY, c.c)
    sessions.add(c.s)
    last = Math.max(last, c.at)
    for (const [e, n] of Object.entries(c.x)) {
      extsLife[e] = (extsLife[e] ?? 0) + n
      if (d === today) extsToday[e] = (extsToday[e] ?? 0) + n
    }
    if (c.m) modelsLife[c.m] = (modelsLife[c.m] ?? 0) + c.c.code
    if (d === today) {
      const hr = new Date(c.at).getHours()
      hours[hr] = (hours[hr] ?? 0) + c.c.code
      if (c.m) modelsToday[c.m] = (modelsToday[c.m] ?? 0) + c.c.code
    }
  }

  return {
    v: 1,
    id: CLOUD_ID,
    name: CLOUD_NAME,
    at: last,
    d: today,
    today: days[today] ?? { ...EMPTY },
    life,
    // The newest 120 days, as the other computers keep.
    days: Object.fromEntries(Object.keys(days).sort().slice(-120).map(k => [k, days[k] ?? { ...EMPTY }])),
    hours,
    modelsToday,
    modelsLife,
    extsToday,
    extsLife,
    sessions: sessions.size,
    commits: use.length,
  }
}

/** Folder names never searched for repos: hidden ones, the system's, and dependency or build output. */
const SKIP = new Set([
  'node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'Photos', 'Public', 'Downloads',
  'vendor', 'venv', 'env', 'dist', 'build', 'target', 'out', '__pycache__', 'Pods', 'DerivedData',
  'AppData', 'snap', 'go', 'site-packages',
])
export const skipDir = (name: string): boolean => name.startsWith('.') || SKIP.has(name)

/** Repos picked by hand are matched by their folder, with or without a trailing slash. */
export const samePath = (a: string, b: string): boolean => a.replace(/\/+$/, '') === b.replace(/\/+$/, '')
