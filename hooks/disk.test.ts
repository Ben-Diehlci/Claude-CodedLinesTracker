import { expect, mock, test } from 'claude-code/testing'

import { carried, heredocs, movesHistory, newLines, parseDiff, rewritten, tooMuch } from './disk'

const T0 = 1_700_000_000_000

// One file as `git diff -U0` prints it: added lines, removed lines.
const diff = (path: string, add: string[], del: string[] = [], isNew = false) =>
  [
    `diff --git a/${path} b/${path}`,
    isNew ? 'new file mode 100644' : 'index 1111111..2222222 100644',
    `--- ${isNew ? '/dev/null' : `a/${path}`}`,
    `+++ b/${path}`,
    `@@ -1,${del.length} +1,${add.length} @@`,
    ...del.map(l => `-${l}`),
    ...add.map(l => `+${l}`),
    '',
  ].join('\n')

test('reads added and removed lines per file, blank lines left out', () => {
  const snap = parseDiff(diff('a/x.ts', ['const a = 1', '', '+++ b/fake', 'const a = 1'], ['old']))

  expect([...snap.add.get('a/x.ts')!]).toEqual([
    ['const a = 1', 2],
    ['+++ b/fake', 1],
  ])
  expect([...snap.del.get('a/x.ts')!]).toEqual([['old', 1]])
})

test('only lines new since the last look count; a moved file counts nothing', () => {
  const before = parseDiff(diff('x.ts', ['const a = 1']))
  const after = parseDiff(diff('x.ts', ['const a = 1', 'const b = 2']))
  expect(newLines(before, after)).toEqual({ 'x.ts': ['const b = 2'] })

  const moved = parseDiff(diff('old.ts', [], ['const a = 1', 'const b = 2']) + diff('new.ts', ['const a = 1', 'const b = 2'], [], true))
  expect(newLines(parseDiff(''), moved)).toEqual({})
})

test('a copied library is too much for one step', () => {
  expect(tooMuch({ 'x.ts': Array.from({ length: 3001 }, (_, i) => `l${i}`) })).toBe(true)
  expect(tooMuch({ 'x.ts': ['a'] })).toBe(false)
})

test('git commands that bring in old lines are told apart', () => {
  expect(movesHistory('git stash pop')).toBe(true)
  expect(movesHistory('cd x && git -C y pull --rebase')).toBe(true)
  expect(movesHistory('git status && git add x.ts')).toBe(false)
})

test('here-documents in a shell command, in both orders', () => {
  const cmd = ["cat > /tmp/a.sh <<'EOF'", 'echo hi', 'EOF', 'cat <<EOF >> "b c.py"', 'x = 1', 'EOF', "python3 - <<'E'", 'print(1)', 'E'].join('\n')

  expect(heredocs(cmd)).toEqual([
    { path: '/tmp/a.sh', text: 'echo hi' },
    { path: 'b c.py', text: 'x = 1' },
  ])
})

test('a connector call that carries a code file', () => {
  expect(carried({ tool: 'mcp__UnityMCP__create_script', path: 'Assets/Scripts/Road.cs', contents: 'class Road {\n}' })).toEqual([
    { path: 'Assets/Scripts/Road.cs', text: 'class Road {\n}' },
  ])
  expect(carried({ tool: 'mcp__x__note', name: 'hello', text: 'a\nb' })).toEqual([])
})

// ---- Through the mod itself ----

const setup = (on: any, repo: string) => {
  const store = new Map<string, any>()
  const disk = { text: '' }
  on('store.get', (_: any, e: any) => ({ value: store.get(e.key) }))
  on('store.set', (_: any, e: any) => {
    store.set(e.key, JSON.parse(JSON.stringify(e.value)))

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 'me' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('env.get', () => ({ value: '/home/me' }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_: any, e: any) => {
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (e.argv[0] === 'git' && e.argv.includes('--show-toplevel')) return repo && e.argv[2].startsWith(repo) ? ok(`${repo}\n`) : { value: { ...ok('').value, exitCode: 128 } }
    if (e.argv[0] === 'sh') return ok(disk.text)

    return { value: { ...ok('').value, exitCode: 1 } }
  })
  mock.clock(on, { now: T0 })
  const stats = () => store.get('s-me')?.s

  return { disk, stats }
}

test('a script made by a connector tool is counted from the disk', async ($, on) => {
  const { disk, stats } = setup(on, '/repo')
  on('tool.call', (_: any, e: any) => {
    if (e.tool === 'mcp__UnityMCP__create_script') disk.text = diff('Assets/Scripts/Road.cs', ['// the road', 'class Road {', '}'], [], true)

    return { result: {} }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__UnityMCP__create_script', path: 'Assets/Scripts/Road.cs', contents: '// the road\nclass Road {\n}' } as any)

  expect(stats().total).toEqual({ all: 3, code: 2, comments: 1, blank: 0 })
  expect(stats().others).toBe(1)
  expect(stats().byExt).toEqual({ cs: 2 })
})

test('an Edit is not counted a second time by the next shell command', async ($, on) => {
  const { disk, stats } = setup(on, '/repo')
  on('tool.call', (_: any, e: any) => {
    if (e.tool === 'Edit') disk.text = diff('x.ts', ['const a = 1'])
    if (e.tool === 'Bash' && e.command !== 'true') disk.text = diff('x.ts', ['const a = 1', 'const b = 2'])

    return { result: {} }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'true' } as any) // the first look
  await $.tool.call({ tool: 'Edit', file_path: '/repo/x.ts', old_string: '', new_string: 'const a = 1' } as any)
  await $.tool.call({ tool: 'Bash', command: "sed -i '' ... x.ts" } as any)

  expect(stats().total.code).toBe(2)
  expect(stats().edits).toBe(1)
  expect(stats().others).toBe(1)
})

test('lines a git stash pop brings back are not counted', async ($, on) => {
  const { disk, stats } = setup(on, '/repo')
  on('tool.call', (_: any, e: any) => {
    if (e.tool === 'Bash') disk.text = diff('x.ts', ['const a = 1'])

    return { result: {} }
  })

  await $.session.start({ cwd: '/repo', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'git stash pop' } as any)
  await $.tool.call({ tool: 'Bash', command: 'true' } as any)

  expect(stats()?.total.code ?? 0).toBe(0)
})

test('outside a git repo a here-document and a connector file are counted from the input', async ($, on) => {
  const { stats } = setup(on, '')
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: "cat > run.sh <<'EOF'\n# say hi\necho hi\nEOF" } as any)
  await $.tool.call({ tool: 'mcp__UnityMCP__create_script', path: 'Road.cs', contents: 'class Road {\n}' } as any)

  expect(stats().total).toEqual({ all: 4, code: 3, comments: 1, blank: 0 })
  expect(stats().others).toBe(2)
  expect(Object.keys(stats().byFile)).toEqual(['/work/run.sh', '/work/Road.cs'])
})

test('a chat started in a spare folder and then moved into a project is watched there, under the project name', async ($, on) => {
  const { disk, stats } = setup(on, '/repo')
  let where = '/spares/spare-abc'
  on('session.cwd', () => ({ value: where }))
  on('tool.call', (_: any, e: any) => {
    if (e.command === 'make-file') disk.text = diff('x.py', ['x = 1'], [], true)

    return { result: {} }
  })

  await $.session.start({ cwd: '/spares/spare-abc', surface: 'desktop', isInteractive: true })
  where = '/repo'
  await $.tool.call({ tool: 'Bash', command: 'true' } as any)
  await $.tool.call({ tool: 'Bash', command: 'make-file' } as any)

  expect(stats().total.code).toBe(1)
  expect(stats().byExt).toEqual({ py: 1 })
})

test('an Edit counts the lines it changed, not the unchanged lines around them', async ($, on) => {
  expect(rewritten('a\nb\nc', 'a\nB\nc\nd')).toBe('B\nd')
  expect(rewritten('x = 1', 'x = 1')).toBe('')

  const { stats } = setup(on, '')
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  const edit = { tool: 'Edit', file_path: '/work/x.ts', old_string: 'const a = 1\nconst b = 2', new_string: 'const a = 1\nconst b = 3\nconst c = 4' }
  await $.tool.call(edit as any)
  await $.tool.call({ ...edit, old_string: 'const b = 3', new_string: 'const b = 5' } as any) // the same line, rewritten again

  expect(stats().total.code).toBe(3)
  expect(stats().edits).toBe(2)
})
