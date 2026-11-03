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

// The band's Svg (desktop designs draw the whole band as one Svg), found by its alt text.
const bandSvg = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((x: any) => /code lines this session/.test(x.props?.alt ?? ''))

// A pane section's Svg, picked by what its alt text starts with.
const svgAlt = async (ui: any, pick: RegExp) =>
  ((await ui.findAll({ type: 'Svg' })) as any[]).map(x => x.props?.alt as string).find(alt => pick.test(alt ?? ''))

const svgSource = async (ui: any, pick: RegExp) =>
  ((await ui.findAll({ type: 'Svg' })) as any[]).find(x => pick.test(x.props?.alt ?? ''))?.props.source as string | undefined

const buttons = async (ui: any) => ((await ui.findAll({ type: 'Button' })) as any[]).map(b => b.props?.label as string)

const stubs = (on: any) => {
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.id', () => ({ value: 'me' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
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
    if (surface === 'terminal') expect((await pane.find({ type: 'Text', text: /LINES CRAB/ }))?.text).toMatch(/LV 1/)
    else expect((await svgAlt(pane, /by model/))).toMatch(/^2 code lines today by model: Opus 5\.5 2/)
    await pane.unmount()

    const band = await $.ui.mount({ ...BAND, surface } as any)
    if (surface === 'terminal') expect((await band.find({ type: 'Text', text: /LINES/ }))?.text).toMatch(/LINES/)
    else expect((await bandSvg(band))?.props.alt).toMatch(/2 code lines this session/)
    await band.unmount()
  }
})

test('Clawd is a Raster on the terminal and in an Svg on the desktop', async ($, on) => {
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

  // The desktop band is one Svg with Clawd's animation timeline inside it.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(band))?.props.source).toMatch(/attributeName="visibility"/)
  expect((await bandSvg(band))?.props.isInteractive).toBe(true)
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect((await clawds(pane)).map(x => x.type)).toEqual(['Svg'])
  await pane.unmount()
})

test('mascot off hides Clawd in the band and the pane', async ($, on) => {
  stubs(on)
  memory(on, { prefs: { status: true, pane: true, mascot: false } })
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface } as any)
    expect(await clawds(pane)).toHaveLength(0)
    await pane.unmount()

    const band = await $.ui.mount({ ...BAND, surface } as any)
    expect(await clawds(band)).toHaveLength(0)
    if (surface === 'terminal') expect(await band.find({ type: 'Text', text: /LINES/ })).toBeTruthy()
    else expect((await bandSvg(band))?.props.source).not.toMatch(/fill="#d97757"/) // Clawd's own pixels (the stage's mini Clawd uses a class)
    await band.unmount()
  }
})

test('every design draws on the terminal and the desktop', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/work/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  for (const id of ['classic', 'card', 'arcade', 'compact']) {
    await $.command.run({ command: 'linecount', args: `style ${id}` })

    const term = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
    expect(await term.find({ type: 'Text', text: /LINES|SESSION/ })).toBeTruthy()
    await term.unmount()

    const desk = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
    if (id === 'classic') expect(await desk.find({ type: 'Text', text: /LINES/ })).toBeTruthy()
    else expect((await bandSvg(desk))?.props.source).toMatch(/<svg[^>]*>.*<\/svg>/s)
    await desk.unmount()
  }
})

test('auto picks card, or compact when the band is narrow', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  const wide = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 120 }, surface: 'desktop' } as any)
  expect((await bandSvg(wide))?.props.height).toBe(74)
  await wide.unmount()
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 50 }, surface: 'desktop' } as any)
  expect((await bandSvg(narrow))?.props.height).toBe(30)
  await narrow.unmount()
})

test('commands: style, outfit and section; the goal is gone', async ($, on) => {
  stubs(on)
  const m = memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const run = async (args: string) => (await $.command.run({ command: 'linecount', args })) as any
  expect((await run('style arcade')).text).toMatch(/arcade/)
  expect((await run('style nonsense')).text).toMatch(/one of/)
  expect((await run('outfit crown')).text).toMatch(/crown/)
  expect((await run('goal 750')).text).toMatch(/removed/)
  expect((await run('section heat off')).text).toMatch(/off/)
  expect((await run('section heat')).text).toMatch(/on/)
  await run('section badges off')

  const saved = m.get('prefs') as any
  expect(saved).toMatchObject({ style: 'arcade', outfit: 'crown' })
  expect(saved.goal).toBeUndefined()
  expect(saved.sections.badges).toBe(false)
  expect(saved.sections.heat).toBe(true)

  // The pane drops a switched-off section and keeps the rest.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await svgAlt(pane, /^Badges/)).toBeUndefined()
  expect(await svgAlt(pane, /4 weeks/)).toMatch(/last 4 weeks/)
  expect(await pane.find({ type: 'Text', text: /code lines this session/ })).toBeFalsy()
  await pane.unmount()

  // Details (id numbers) is off by default; switched on it shows the split of this session's lines.
  await run('section numbers on')
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect(await again.find({ type: 'Text', text: /DETAILS THIS SESSION/ })).toBeTruthy()
  expect((await again.find({ type: 'Text', text: /blank, not counted/ }))?.text).toMatch(/0 blank/)
  expect(await again.find({ type: 'Text', text: /BADGES/ })).toBeFalsy()
  await again.unmount()
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect((await desk.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
  await desk.unmount()
})

test('old prefs keep their toggles when the shape grows', async ($, on) => {
  stubs(on)
  memory(on, { prefs: { status: true, pane: false, mascot: false } })
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  const labels = await buttons(pane)
  expect(labels).toContain(' Pane on start: off')
  expect(labels).toContain(' Mascot: off')
  expect(labels.some(l => /Goal/.test(l))).toBe(false)
  expect((await pane.findAll({ type: 'Select' })).map((x: any) => x.props.value)).toEqual(['auto', 'auto', 'none'])
  await pane.unmount()
})

test('the mobile pane draws Buttons instead of Select', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const mobile = await $.ui.mount({ ...PANE, surface: 'mobile' } as any)
  expect(await mobile.findAll({ type: 'Select' })).toHaveLength(0)
  const labels = await buttons(mobile)
  expect(labels).toContain('Design: Auto')
  expect(labels).toContain(' Outfit: auto')
  expect(labels).toContain(' Background: App default')
  await mobile.unmount()

  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await desk.findAll({ type: 'Select' })).toHaveLength(3)
  await desk.unmount()
})

test('a chosen pane background fills the pane and fixes the drawings to light or dark', async ($, on) => {
  stubs(on)
  const m = memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Default: no fill, the drawings follow the app's light or dark.
  const plain = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(((await plain.drawn()) as any).props.backgroundColor).toBeUndefined()
  expect((await plain.find({ type: 'Svg' }))?.props.source).toMatch(/prefers-color-scheme: dark/)
  await plain.unmount()

  expect(((await $.command.run({ command: 'linecount', args: 'background nope' })) as any).text).toMatch(/one of/)
  expect(((await $.command.run({ command: 'linecount', args: 'background slate' })) as any).text).toMatch(/Slate/)
  expect((m.get('prefs') as any).bg).toBe('slate')

  const dark = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  // The fill covers the whole pane; the settings hide behind one highlighted Settings button.
  const fill = ((await dark.drawn()) as any).children[0]
  expect(fill.props.backgroundColor).toBe('#30302E')
  // Closed, the fill stretches to the pane's bottom edge.
  expect(fill.props.minHeight).toBe(40)
  const src = (await dark.find({ type: 'Svg' }))?.props.source as string
  expect(src).not.toMatch(/prefers-color-scheme/)
  expect(src).toMatch(/\.fg\{fill:#F5F4EE\}/)
  expect(await buttons(dark)).toEqual(['Settings'])
  expect((await dark.find({ type: 'Button' }))?.props.variant).toBe('primary')
  expect(await dark.findAll({ type: 'Select' })).toHaveLength(0)

  // Opened, the settings show below the fill, on the app's own background.
  await dark.press({ key: 'settings' })
  expect(await buttons(dark)).toContain('Heat map: on ')
  expect(await buttons(dark)).toContain('Hide settings')
  const tree = (await dark.drawn()) as any
  expect(JSON.stringify(tree.children[0])).not.toMatch(/"Select"/)
  expect(JSON.stringify(tree.children[1])).toMatch(/"Select"/)
  expect((await dark.find({ type: 'Text', text: /^Sections$/ }))?.props.dimColor).toBe(true)
  await dark.unmount()

  // The terminal keeps its own background.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect(((await term.drawn()) as any).props.backgroundColor).toBeUndefined()
  await term.unmount()
})

test('a chat woken from sleep gets its own stats back from the store', async ($, on) => {
  stubs(on)
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  // What this chat saved before the app put it to sleep: its memory is gone, its store key is kept.
  memory(on, {
    prefs: { style: 'classic' },
    's-me': {
      t: T0 - 60_000, w: T0 - 60_000, proj: 'proj', life: c(442), days: {}, hours: { d: '', v: [] }, owl: false, exts: ['ts'],
      s: { total: c(442), writes: 3, edits: 4, byExt: { ts: 442 }, byFile: { '/a/draw.ts': 195 }, startedAt: T0 - 3_600_000 },
    },
  })
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/x/proj', surface: 'desktop', isInteractive: true })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
  expect((await band.find({ type: 'Text', text: /LINES/ }))?.text).toMatch(/LINES 442 code lines/)
  await band.unmount()

  // The next write adds to the restored count, and the saved copy follows.
  await $.tool.call(WRITE)
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
  expect((await again.find({ type: 'Text', text: /LINES/ }))?.text).toMatch(/LINES 444 code lines/)
  await again.unmount()
})

test('the pane follows its width when it is resized', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  const widths = async (ui: any) => ((await ui.findAll({ type: 'Svg' })) as any[]).map(x => x.props.width as number)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  const narrow = await widths(pane)
  await pane.redraw({ ...PANE.props, bodyColumns: 120 } as any)
  const wide = await widths(pane)
  expect(narrow.every(n => n === narrow[0])).toBe(true)
  expect(wide[0]).toBeGreaterThan(narrow[0] * 2)
  // The heat strip spans the wider pane: its squares grow with it.
  const sq = async () => Number(/<rect x="[\d.]+" y="16.5" width="(\d+)"/.exec((await svgSource(pane, /weeks/))!)![1])
  const wideSq = await sq()
  await pane.redraw({ ...PANE.props, bodyColumns: 40 } as any)
  expect(wideSq).toBeGreaterThan(await sq())
  await pane.unmount()
})

test('crossing 1,000 lines throws confetti', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call(WRITE)
  const calm = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(calm))?.props.source).not.toMatch(/dur="1.1s"/) // confetti
  await calm.unmount()

  await $.tool.call({ tool: 'Write', file_path: '/a/big.ts', content: Array.from({ length: 1100 }, (_, i) => `const v${i} = ${i}`).join('\n') })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(band))?.props.source).toMatch(/dur="1.1s"/)
  await band.unmount()

  const term = await $.ui.mount({ ...BAND, surface: 'terminal' } as any)
  expect((await term.find({ type: 'Text', text: /1,000 lines!/ }))?.text).toMatch(/1,000 lines!/)
  await term.unmount()
})

test('sessions right now lists projects, and an outfit shows by level', async ($, on) => {
  stubs(on)
  const day = new Date(T0)
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  memory(on, {
    's-other': { t: T0 - 1000, w: T0 - 2000, proj: 'web-app', life: c(900), days: { [key]: c(268) }, hours: { d: key, v: [] }, owl: true, exts: ['ts', 'php'] },
    base: { life: c(18_000), days: {}, folded: [] },
  })
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/home/Claude-CodedLinesTracker', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect((await term.find({ type: 'Text', text: /web-app/ }))?.text).toMatch(/268/)
  expect((await term.find({ type: 'Text', text: /Claude-CodedLinesTracker/ }))?.text).toMatch(/2/)
  expect((await term.find({ type: 'Text', text: /LINES CRAB/ }))?.text).toMatch(/LV 8/)
  expect((await term.find({ type: 'Text', text: /Night owl/ }))?.text).toMatch(/●/)
  await term.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await svgAlt(pane, /^Sessions right now/)).toMatch(/web-app 268, Claude-CodedLinesTracker 2/)
  expect(await svgAlt(pane, /Level \d/)).toMatch(/Level 8/)
  expect(await svgAlt(pane, /^Badges/)).toMatch(/Night owl earned/)
  await pane.unmount()

  // LV 8 wears the crown: the Clawd Svg carries the gold crown pixels.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(band))?.props.source).toMatch(/#e8b84a/)
  await band.unmount()
})

test('terminal Clawd and the stage are repainted in place by the timer', async ($, on) => {
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
  await clock.advance(3000) // and the stage's idle loop reaches mini Clawd's nap

  expect(blits.length).toBeGreaterThan(0)
  expect(new Set(blits)).toEqual(new Set(['clawd', 'stage']))
  await band.unmount()
})

test('totals add up every session; the band shows the others live', async ($, on) => {
  stubs(on)
  const day = new Date(T0)
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  const m = memory(on, {
    prefs: { style: 'classic' },
    's-other': { t: T0 - 1000, w: T0 - 1000, life: c(500), days: { [key]: c(100) } },
    // Open but never wrote (the desktop keeps many chats running): not counted as active, not listed.
    's-idle': { t: T0 - 1000, w: 0, proj: 'idle-project', life: c(0), days: {} },
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

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect(await pane.find({ type: 'Text', text: /idle-project/ })).toBeFalsy()
  await pane.unmount()
})

test('the ring cards split lines by model: today across sessions, all time with the lines from before tracking', async ($, on) => {
  stubs(on)
  const day = new Date(T0)
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
  const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
  memory(on, {
    's-other': { t: T0 - 1000, w: T0 - 2000, proj: 'web-app', life: c(300), days: { [key]: c(300) }, hours: { d: key, v: [] }, owl: false, exts: [], ml: { 'Sonnet 5.5': 300 }, mt: { d: key, v: { 'Sonnet 5.5': 300 } } },
    base: { life: c(5000), days: {}, folded: [] },
  })
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await $.tool.call(WRITE)

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  const alt = await svgAlt(pane, /by model/)
  expect(alt).toMatch(/today by model: Sonnet 5\.5 300, Opus 5\.5 2\./)
  expect(alt).toMatch(/all time: Sonnet 5\.5 300, Opus 5\.5 2, before Nov 3 5,000/)
  await pane.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect((await term.find({ type: 'Text', text: /lines today/ }))?.text).toMatch(/Opus 5\.5 2/)
  await term.unmount()
})
