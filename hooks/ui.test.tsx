import { expect, mock, test } from 'claude-code/testing'

const T0 = 1_700_000_000_000
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const PANE = {
  plugin: 'lines-tracker',
  component: 'Pane',
  requestId: 'lines-tracker',
  props: {
    title: 'Lines written',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BAND = {
  plugin: 'lines-tracker',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false },
} as const

// An in-memory $.store, so keys written by "other sessions" can be seeded.
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

// The Clawd drawings on a mounted tree: the Raster by key, the Svg by its alt text (the pane's sparkline is an Svg too).
const clawds = async (ui: any) =>
  [
    ...(await ui.findAll({ type: 'Raster', key: 'clawd' })),
    ...(await ui.findAll({ type: 'Svg' })).filter((x: any) => /Clawd/.test(x.props?.alt ?? '')),
  ] as any[]

const stubs = (on: any) => {
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.id', () => ({ value: 'me' }))
}

const WRITE = { tool: 'Write', file_path: '/a/x.ts', content: '// c\nconst a = 1\n\nconst b = 2' } as const

test('pane and band draw on every surface', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  for (const surface of SURFACES) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /code lines this session/ }))?.text).toMatch(/2/)
    await pane.unmount()

    const band = await $.ui.mount({ ...BAND, surface } as any)
    expect((await band.find({ type: 'Text', text: /LINES/ }))?.text).toMatch(/LINES/)
    await band.unmount()
  }
})

test('Clawd is a Raster on the terminal and an Svg on the desktop', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  for (const where of [
    { ...BAND, surface: 'terminal' },
    { ...PANE, surface: 'terminal' },
  ] as const) {
    const ui = await $.ui.mount(where as any)
    const found = await clawds(ui)
    expect(found.map(x => x.type)).toEqual(['Raster'])
    await ui.unmount()
  }

  for (const where of [
    { ...BAND, surface: 'desktop' },
    { ...PANE, surface: 'desktop' },
  ] as const) {
    const ui = await $.ui.mount(where as any)
    const found = await clawds(ui)
    expect(found.map(x => x.type)).toEqual(['Svg'])
    await ui.unmount()
  }
})

test('mascot off hides Clawd in the band and the pane', async ($, on) => {
  stubs(on)
  memory(on, { prefs: { status: true, pane: true, mascot: false } })
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const where of [{ ...BAND, surface }, { ...PANE, surface }] as const) {
      const ui = await $.ui.mount(where as any)
      expect(await clawds(ui)).toHaveLength(0)
      expect(await ui.find({ type: 'Text', text: /LINES/ })).toBeTruthy()
      await ui.unmount()
    }
  }
})

test('terminal Clawd is repainted in place by the timer', async ($, on) => {
  stubs(on)
  memory(on)
  const clock = mock.clock(on, { now: T0 })
  const blits: string[] = []
  on('ui.blit', (_: any, e: any) => {
    blits.push(e.key)

    return { value: {} }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
  await $.tool.call(WRITE) // a write makes him hop
  await clock.advance(400)

  expect(blits.length).toBeGreaterThan(0)
  expect(new Set(blits)).toEqual(new Set(['clawd']))
  await band.unmount()
})

test('totals add up every session; the band shows the others live', async ($, on) => {
  stubs(on)
  const day = new Date(T0)
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  const m = memory(on, {
    's-other': { t: T0 - 1000, life: c(500), days: { [key]: c(100) } },
    base: { life: c(1000), days: {}, folded: [] },
  })
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE) // 2 code lines from this session

  // This session wrote only its own key and left the other session's alone.
  expect((m.get('s-other') as any).life.code).toBe(500)
  expect((m.get('s-me') as any).life.code).toBe(2)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await band.find({ type: 'Text', text: /sessions active/ }))?.text).toMatch(/2 sessions active/)
  expect((await band.find({ type: 'Text', text: /all sessions today/ }))?.text).toMatch(/102/)
  expect((await band.find({ type: 'Text', text: /all time/ }))?.text).toMatch(/1,502/)
  await band.unmount()
})
