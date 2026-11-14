import { expect, mock, test } from 'claude-code/testing'
import { CLOUD_ID, cloudTotals, countable, isGenerated, parseLog, skipDir } from './cloud'
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

const stubs = (on: any) => {
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.id', () => ({ value: 'me' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
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
