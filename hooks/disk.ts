// Lines Claude writes without the Write or Edit tools: a shell command, a terminal tab, a connector (MCP)
// tool such as Unity's "create script". Two ways to see them, both local and token-free:
//   1. In a git repo: ask git which code lines are new on disk since the last look (parseDiff, newLines).
//   2. Anywhere else: read the tool's own input (heredocs in a shell command, file text in a connector call).
import { CODE_EXTS, extOf } from './count'

/** Lines per file: text -> how many times it appears. Insertion order is the order git listed them. */
export type Bag = Map<string, Map<string, number>>

/** What is uncommitted on disk: lines added and lines removed, per file (paths relative to the repo). */
export type Snap = { add: Bag; del: Bag }

/** One look may bring in at most this much; more is a copied library or a scaffold, not typed code. */
export const MAX_FILES = 40
export const MAX_LINES = 3000

/** File types the disk watch counts: code only, and not the kinds tools generate (pictures, data). */
const GENERATED = new Set(['svg', 'xml'])
export const WATCHED = CODE_EXTS.filter(x => !GENERATED.has(x))

const put = (bag: Bag, path: string, line: string, n = 1) => {
  let lines = bag.get(path)
  if (!lines) bag.set(path, (lines = new Map()))
  lines.set(line, (lines.get(line) ?? 0) + n)
}

/**
 * The script the mod runs (one process): the diff of tracked files against the last commit, then every
 * untracked, not ignored file as a diff against nothing. Arguments: the repo, then the path patterns.
 */
export const SNAP_SCRIPT = [
  'cd "$1" || exit 1',
  'shift',
  'git -c core.quotepath=off diff -U0 --no-color --no-ext-diff --no-renames HEAD -- "$@" 2>/dev/null',
  'git ls-files -z --others --exclude-standard -- "$@" 2>/dev/null | xargs -0 -n 1 git -c core.quotepath=off diff -U0 --no-color --no-ext-diff --no-index /dev/null 2>/dev/null',
  'exit 0',
].join('\n')

export const snapArgs = (repo: string): string[] => ['sh', '-c', SNAP_SCRIPT, 'sh', repo, ...WATCHED.map(x => `*.${x}`)]

/** Reads `git diff -U0` output into added and removed lines per file. Blank lines are left out. */
export const parseDiff = (text: string): Snap => {
  const snap: Snap = { add: new Map(), del: new Map() }
  let path = ''
  let inHunk = false

  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw

    if (line.startsWith('diff --git ')) {
      inHunk = false
      path = ''
      continue
    }
    if (!inHunk) {
      if (line.startsWith('+++ ')) {
        const name = line.slice(4)
        path = name.startsWith('b/') ? name.slice(2) : ''
      } else if (line.startsWith('@@')) {
        inHunk = true
      }
      continue
    }
    if (!path || line.startsWith('@@') || line.startsWith('\\')) continue
    const body = line.slice(1)
    if (body.trim() === '') continue
    if (line[0] === '+') put(snap.add, path, body)
    else if (line[0] === '-') put(snap.del, path, body)
  }

  return snap
}

/** Lines in `cur` that `prev` did not have, per file, each as many times as it is new. */
const grown = (prev: Bag, cur: Bag): Bag => {
  const out: Bag = new Map()
  for (const [path, lines] of cur) {
    const before = prev.get(path)
    for (const [line, n] of lines) {
      const more = n - (before?.get(line) ?? 0)
      if (more > 0) put(out, path, line, more)
    }
  }

  return out
}

/**
 * The lines that became new on disk between two looks, per file. A line that left one place in the same
 * step (a moved file, a moved block) pays for one that appeared, so moving code counts nothing; `paid`
 * holds lines already counted another way (a Write or Edit since the last look).
 */
export const newLines = (prev: Snap, cur: Snap, paid: Bag = new Map()): Record<string, string[]> => {
  const fresh = grown(prev.add, cur.add)
  const gone = new Map<string, number>()
  for (const bag of [grown(cur.add, prev.add), grown(prev.del, cur.del)]) {
    for (const lines of bag.values()) for (const [line, n] of lines) gone.set(line, (gone.get(line) ?? 0) + n)
  }

  const out: Record<string, string[]> = {}
  for (const [path, lines] of fresh) {
    const credit = paid.get(path)
    const kept: string[] = []
    for (const [line, n] of lines) {
      let left = n
      const c = Math.min(left, credit?.get(line) ?? 0)
      if (c > 0) {
        credit!.set(line, credit!.get(line)! - c)
        left -= c
      }
      const g = Math.min(left, gone.get(line) ?? 0)
      if (g > 0) {
        gone.set(line, gone.get(line)! - g)
        left -= g
      }
      for (let i = 0; i < left; i++) kept.push(line)
    }
    if (kept.length > 0) out[path] = kept
  }

  return out
}

/** True when one look brought in more than a person (or Claude) types in one step. */
export const tooMuch = (fresh: Record<string, string[]>): boolean => {
  const files = Object.keys(fresh)

  return files.length > MAX_FILES || files.reduce((n, f) => n + fresh[f]!.length, 0) > MAX_LINES
}

/** Adds a text's non-blank lines to a bag (the lines a Write or Edit already counted). */
export const pay = (paid: Bag, path: string, text: string) => {
  for (const line of text.split('\n')) if (line.trim() !== '') put(paid, path, line.endsWith('\r') ? line.slice(0, -1) : line)
}

/** Git commands that bring in lines nobody just wrote (another branch, a stash, a pull): look, do not count. */
export const movesHistory = (command: string): boolean =>
  /\bgit\s+(?:-C\s+\S+\s+|-\S+\s+)*(?:pull|merge|rebase|stash|checkout|switch|restore|reset|cherry-pick|revert|apply|am|clone|worktree|submodule)\b/.test(command)

export type Written = { path: string; text: string }

const unquote = (s: string): string => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s)

/** Files a shell command writes with a here-document: `cat > file <<'EOF'`, `cat <<EOF > file`, `tee file <<EOF`. */
export const heredocs = (command: string): Written[] => {
  const out: Written[] = []
  const lines = command.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i]!
    const tag = /<<-?\s*(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(head)
    if (!tag) continue
    const end = lines.findIndex((l, j) => j > i && l.trim() === tag[2])
    if (end < 0) break
    const to = /(?:>>?\s*|\btee\s+(?:-a\s+)?)("[^"]+"|'[^']+'|[^\s;&|<>()]+)/.exec(head.replace(/<<-?\s*["']?\w+["']?/, ' '))
    if (to) out.push({ path: unquote(to[1]!), text: lines.slice(i + 1, end).join('\n') })
    i = end
  }

  return out
}

const PATH_KEY = /^(?:path|file_?path|file_?name|uri|name|target)$/i
const TEXT_KEY = /^(?:contents?|text|code|source|script|body|new_?(?:string|source|text|content))$/i

/** A connector (MCP) call that carries a code file: a path with a code file type beside its text. */
export const carried = (input: Record<string, unknown>): Written[] => {
  const out: Written[] = []
  const look = (o: Record<string, unknown>, deep: boolean) => {
    let path = ''
    let text = ''
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') {
        if (!path && PATH_KEY.test(k) && WATCHED.includes(extOf(v)) && /\.[A-Za-z0-9]+$/.test(v)) path = v
        else if (!text && TEXT_KEY.test(k) && v.includes('\n')) text = v
      } else if (deep && v && typeof v === 'object' && !Array.isArray(v)) {
        look(v as Record<string, unknown>, false)
      }
    }
    if (path && text) out.push({ path, text })
  }
  look(input, true)

  return out
}
