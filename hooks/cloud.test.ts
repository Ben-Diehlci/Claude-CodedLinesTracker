import { expect, mock, test } from 'claude-code/testing'
import { CLOUD_ID, cloudTotals, countable, isGenerated, parseLog, skipDir, toCloudFile } from './cloud'
import { dayKey } from './model'

// Output of `git log --no-walk=unsorted FORMAT -p --unified=0`, as git printed it for a test repo: two
// commits from one cloud session on a branch, and the squash GitHub made of them on main.
const AT = Date.parse('2026-11-04T10:00:00')
const s = AT / 1000
const commit = (hash: string, body: string, diff: string) => `\x1e${hash}\x1f${s}\x1f${body}\n\x1f\n\n${diff}`
const SESSION = 'Claude-Session: https://claude.ai/code/session_01AAA'
const A_TS = `diff --git a/a.ts b/a.ts
new file mode 100644
index 0000000..474e4d3
--- /dev/null
+++ b/a.ts
@@ -0,0 +1,4 @@
+// add
+export const a = 1
+
+export const b = 2
`
const B_PY = `diff --git a/b.py b/b.py
new file mode 100644
index 0000000..938a325
--- /dev/null
+++ b/b.py
@@ -0,0 +1,3 @@
+# py
+x = 1
++++ y
`
const LOCK = `diff --git a/package-lock.json b/package-lock.json
new file mode 100644
index 0000000..c0c1bfa
--- /dev/null
+++ b/package-lock.json
@@ -0,0 +1 @@
+{"x":1}
`
const H_A = '1289ec47107fd27bfc974e5edb2da6bc6d7cc023'
const H_B = '29285a426b769f403dcbaa53c0a749f14edfa760'
const H_SQ = '07395c8896babdfa53edadf347bd0379b705289b'
const OUT =
  commit(H_B, `Add b\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n${SESSION}`, B_PY) +
  commit(H_SQ, `Feat (#1)\n\n* Add a\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n${SESSION}\n\n* Add b\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n${SESSION}`, A_TS + B_PY + LOCK) +
  commit(H_A, `Add a\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n${SESSION}`, A_TS + LOCK)

test('a cloud commit: its added lines by file type, its model and session; lock files and blank lines skipped', () => {
  const c = parseLog(OUT, '/r')
  expect(Object.keys(c).sort()).toEqual([H_SQ, H_A, H_B].sort())
  expect(c[H_A]).toMatchObject({ at: AT, s: 'session_01AAA', m: 'Opus 5.5', q: false, c: { all: 3, code: 2, comments: 1, blank: 1 }, x: { ts: 2 }, r: '/r' })
  // "+++ y" inside a hunk is an added line, not a file header.
  expect(c[H_B]?.c).toEqual({ all: 3, code: 2, comments: 1, blank: 0 })
  expect(c[H_SQ]?.q).toBe(true)
  expect(isGenerated('web/package-lock.json')).toBe(true)
  expect(isGenerated('src/lock.ts')).toBe(false)
})

test('a squash counts only when its commits are gone; the same patch twice counts once', () => {
  const c = parseLog(OUT, '/r')
  const all = Object.values(c)
  expect(countable(all).map(x => x.m).sort()).toEqual(['Opus 5.5', 'Sonnet 5.5'])
  // Branch deleted after the squash merge: only the squash is left, and it counts.
  expect(countable([c[H_SQ]!]).length).toBe(1)
  // Cherry-picked into another branch: a new hash, the same patch.
  expect(countable([...all, { ...c[H_A]!, at: AT + 1 }]).length).toBe(2)
})

test('cloud totals: days, today, and lines by model', () => {
  const t = cloudTotals(Object.values(parseLog(OUT, '/r')), AT + 3600_000)
  expect(t.id).toBe(CLOUD_ID)
  expect(t.life.code).toBe(4)
  expect(t.today.code).toBe(4)
  expect(t.days[dayKey(AT)]?.code).toBe(4)
  expect(t.hours[10]).toBe(4)
  expect(t.modelsLife).toEqual({ 'Opus 5.5': 2, 'Sonnet 5.5': 2 })
  expect(t.sessions).toBe(1)
  expect(t.at).toBe(AT)
  expect(cloudTotals(Object.values(parseLog(OUT, '/r')), AT + 86_400_000).today.code).toBe(0)
})

test('the repo search skips hidden, system and dependency folders', () => {
  expect(['.cache', 'node_modules', 'Library', 'target'].every(skipDir)).toBe(true)
  expect(['code', 'Projects', 'Documents'].some(skipDir)).toBe(false)
})

const memory = (on: any, seed: Record<string, unknown> = {}) => {
  const m = new Map<string, unknown>(Object.entries(seed))
  on('store.get', (_: any, e: any) => ({ value: m.get(e.key) }))
  on('store.set', (_: any, e: any) => {
    m.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('store.delete', (_: any, e: any) => {
    m.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...m.keys()] }))

  return m
}

/** `own`: the test stubs process.run, env.get and fs.list itself. */
const stubs = (on: any, own = false) => {
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.id', () => ({ value: 'me' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  if (own) return
  // Not a Mac: the computer has no model name, and no git repo is found.
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.list', () => ({ value: [] }))
}

const PANE = {
  plugin: 'lines-tracker',
  component: 'Pane',
  requestId: 'lines-tracker',
  surface: 'desktop',
  props: { title: 'Lines written', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const run = ($: any, args: string) => $.command.run({ command: 'linecount', args, origin: 'user', presentation: 'text' } as any)

test('cloud lines show as their own computer without a sync folder, and leave with cloud off', async ($, on) => {
  stubs(on)
  const T = AT + 3600_000
  memory(on, { 'cloud-totals': cloudTotals(Object.values(parseLog(OUT, '/r')), T) })
  mock.clock(on, { now: T })

  await $.session.start({ cwd: '/work/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/a/x.ts', content: 'const a = 1' })

  const alt = async () => {
    const pane = await $.ui.mount(PANE as any)
    const found = ((await pane.findAll({ type: 'Svg' })) as any[]).map(x => x.props?.alt as string).find(a => /^Computers:/.test(a ?? ''))
    await pane.unmount()

    return found
  }
  expect(await alt()).toMatch(/This computer 1 today.*Cloud 4 today, 4 all time/)
  expect((await run($, 'cloud')).text).toMatch(/cloud: all .*4 code lines today, 4 all time, from 2 commits in 1 cloud sessions/)
  expect((await run($, 'cloud picked')).text).toMatch(/no repos picked yet/)

  await run($, 'cloud off')
  expect(await alt()).toBeUndefined()
})

test('languages: this chat, today across chats (an older chat from its saved stats) and cloud, and all time', async ($, on) => {
  stubs(on)
  const T = AT + 3600_000
  const d = dayKey(T)
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  // A chat from before per-type tracking: no xl, but its saved stats know its file types.
  const older = { t: T, w: T - 60_000, proj: 'old', life: c(30), days: { [d]: c(30) }, hours: { d, v: [] }, owl: false, exts: ['go'], s: { total: c(30), writes: 1, edits: 0, byExt: { go: 30 }, byFile: {}, startedAt: T } }
  memory(on, { 'cloud-totals': cloudTotals(Object.values(parseLog(OUT, '/r')), T), 's-old': older })
  mock.clock(on, { now: T })

  await $.session.start({ cwd: '/work/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/a/x.ts', content: 'const a = 1\nconst b = 2' })
  await $.tool.call({ tool: 'Write', file_path: '/a/y.py', content: 'x = 1' })

  for (const surface of ['desktop', 'terminal'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface } as any)
    if (surface === 'desktop') {
      const alt = ((await pane.findAll({ type: 'Svg' })) as any[]).map(x => x.props?.alt as string).find(a => /^Languages:/.test(a ?? ''))
      // Cloud adds .ts 2 and .py 2 (its squash is skipped).
      expect(alt).toBe('Languages: this chat .ts 2, .py 1; today .go 30, .ts 4, .py 3; all time .go 30, .ts 4, .py 3')
    } else {
      expect(await pane.find({ type: 'Text', text: /\.go\s+-\s+30\s+30/ })).toBeTruthy()
    }
    await pane.unmount()
  }
})

test('the cloud file: the totals shape plus source and scannedBy, id "cloud"', () => {
  const T = AT + 3600_000
  const f = toCloudFile(cloudTotals(Object.values(parseLog(OUT, '/r')), T), 'studio', T)
  expect(Object.keys(f).sort()).toEqual(
    ['v', 'id', 'name', 'at', 'd', 'today', 'life', 'days', 'hours', 'modelsToday', 'modelsLife', 'extsToday', 'extsLife', 'source', 'scannedBy'].sort(),
  )
  expect(f).toMatchObject({ v: 1, id: 'cloud', name: 'Cloud', at: T, d: dayKey(T), source: 'cloud', scannedBy: 'studio' })
  expect(f.life.code).toBe(4)
  expect(f.today.code).toBe(4)
  expect(f.extsLife).toEqual({ ts: 2, py: 2 })
})

test('with a synced folder each computer leaves cloud-<id>.json; not with sync or cloud off; the mod never adds it in', async ($, on) => {
  stubs(on, true)
  const T = AT + 3600_000
  const d = dayKey(T)
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  memory(on, { prefs: { status: true, pane: true, syncDir: '/sync', count: 'both' }, 'cloud-commits': parseLog(OUT, '/r') })
  mock.clock(on, { now: T })
  on('process.run', (_: any, e: any) => ({
    value: {
      exitCode: e.argv[0] === 'scutil' || e.argv[0] === 'system_profiler' ? 0 : 1,
      stdout: e.argv[0] === 'scutil' ? 'studio\n' : e.argv[0] === 'system_profiler' ? '      Model Name: Mac Studio\n' : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  // The other computer's totals and its own cloud file (big numbers, so adding it in would show).
  const laptop = { v: 1, id: 'laptop', name: 'MacBook Pro', at: T, d, today: c(10), life: c(100), days: { [d]: c(10) }, hours: Array(24).fill(0), modelsToday: {}, modelsLife: {} }
  const theirCloud = { ...laptop, id: 'cloud', name: 'Cloud', today: c(77777), life: c(77777), days: { [d]: c(77777) }, source: 'cloud', scannedBy: 'laptop' }
  on('env.get', () => ({ value: '/home/me' }))
  const files: Record<string, unknown> = { 'totals-laptop.json': laptop, 'cloud-laptop.json': theirCloud }
  on('fs.list', () => ({ value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: 1, isLink: false })) }))
  on('fs.read', (_: any, e: any) => ({ value: JSON.stringify(files[String(e.path).split('/').pop()!] ?? '') }))
  const writes: Record<string, string> = {}
  on('fs.write', (_: any, e: any) => {
    writes[e.path] = e.content ?? e.data ?? e.text

    return { value: undefined }
  })

  await $.session.start({ cwd: '/work/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/a/x.ts', content: 'const a = 1' })
  await run($, 'cloud all')

  const mine = JSON.parse(writes['/sync/cloud-studio.json'] ?? 'null')
  expect(mine).toMatchObject({ v: 1, id: 'cloud', name: 'Cloud', at: T, d, source: 'cloud', scannedBy: 'studio', life: { code: 4 }, today: { code: 4 } })
  expect(Array.isArray(mine.hours)).toBe(true)

  // Combined: this Mac 1 + laptop 100 + Cloud 4, never the other computer's cloud file.
  const pane = await $.ui.mount(PANE as any)
  const alt = ((await pane.findAll({ type: 'Svg' })) as any[]).map(x => x.props?.alt as string).find(a => /^Computers:/.test(a ?? ''))
  await pane.unmount()
  expect(alt).toMatch(/Cloud 4 today, 4 all time/)
  expect(alt).toMatch(/MacBook Pro 10 today, 100 all time/)
  expect(alt).not.toMatch(/77,777/)
  // Only one Cloud row (the other computer's cloud file is not a computer), and the combined sum is 1 + 100 + 4.
  expect(alt?.match(/Cloud/g)?.length).toBe(1)
  const band = await $.ui.mount({ plugin: 'lines-tracker', component: 'AbovePrompt', requestId: 'band', surface: 'desktop', props: { hasSurvey: false, isWorking: false, bodyColumns: 160 } } as any)
  const src = ((await band.findAll({ type: 'Svg' })) as any[]).map(x => x.props?.source as string).join(' ')
  await band.unmount()
  expect(src).toMatch(/105 all time, combined/)

  // Cloud off: no cloud file is written.
  delete writes['/sync/cloud-studio.json']
  await run($, 'cloud off')
  expect(Object.keys(writes).some(k => k.includes('/cloud-'))).toBe(false)

  // Sync off: no cloud file either.
  await run($, 'sync off')
  await run($, 'cloud all')
  expect(Object.keys(writes).some(k => k.includes('/cloud-'))).toBe(false)
})
