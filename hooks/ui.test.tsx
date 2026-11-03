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

const buttons = async (ui: any) => ((await ui.findAll({ type: 'Button' })) as any[]).map(b => b.props?.label as string)

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
    if (surface === 'terminal') expect((await pane.find({ type: 'Text', text: /LINES CRAB/ }))?.text).toMatch(/LV 1/)
    else expect((await svgAlt(pane, /code lines this session,/))).toMatch(/^2 code lines this session/)
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
    else expect((await bandSvg(band))?.props.source).not.toMatch(/attributeName="visibility"/)
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
  expect((await bandSvg(wide))?.props.height).toBe(56)
  await wide.unmount()
  const narrow = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns: 50 }, surface: 'desktop' } as any)
  expect((await bandSvg(narrow))?.props.height).toBe(30)
  await narrow.unmount()
})

test('commands: style, outfit, goal and section', async ($, on) => {
  stubs(on)
  const m = memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const run = async (args: string) => (await $.command.run({ command: 'linecount', args })) as any
  expect((await run('style arcade')).text).toMatch(/arcade/)
  expect((await run('style nonsense')).text).toMatch(/one of/)
  expect((await run('outfit crown')).text).toMatch(/crown/)
  expect((await run('goal 750')).text).toMatch(/750/)
  expect((await run('goal abc')).text).toMatch(/number/)
  expect((await run('section heat off')).text).toMatch(/off/)
  expect((await run('section heat')).text).toMatch(/on/)
  await run('section badges off')

  const saved = m.get('prefs') as any
  expect(saved).toMatchObject({ style: 'arcade', outfit: 'crown', goal: 750 })
  expect(saved.sections.badges).toBe(false)
  expect(saved.sections.heat).toBe(true)

  // The pane drops a switched-off section and keeps the rest.
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' } as any)
  expect(await svgAlt(pane, /^Badges/)).toBeUndefined()
  expect(await svgAlt(pane, /12 weeks/)).toMatch(/12 weeks/)
  expect(await pane.find({ type: 'Text', text: /code lines this session/ })).toBeFalsy()
  await pane.unmount()

  // Numbers is off by default; switching it on brings back the old text block.
  await run('section numbers on')
  const again = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect((await again.find({ type: 'Text', text: /code lines this session/ }))?.text).toMatch(/0/)
  expect(await again.find({ type: 'Text', text: /BADGES/ })).toBeFalsy()
  await again.unmount()
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
  expect(labels).toContain(' Goal: 500')
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
  expect(((await dark.drawn()) as any).props.backgroundColor).toBe('#30302E')
  const src = (await dark.find({ type: 'Svg' }))?.props.source as string
  expect(src).not.toMatch(/prefers-color-scheme/)
  expect(src).toMatch(/\.fg\{fill:#F5F4EE\}/)
  expect((await dark.find({ type: 'Text', text: /^Sections$/ }))?.props.color).toBe('#C2C0B6')
  // The app's own button text would sink into a dark fill: our Buttons carry their label as Text in the light color.
  expect((await dark.find({ type: 'Text', text: /^Band: on$/ }))?.props.color).toBe('#F5F4EE')
  expect(await buttons(dark)).toContain('Heat map: on ')
  await dark.unmount()

  // The terminal keeps its own background.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' } as any)
  expect(((await term.drawn()) as any).props.backgroundColor).toBeUndefined()
  await term.unmount()
})

test('crossing 1,000 lines throws confetti', async ($, on) => {
  stubs(on)
  memory(on)
  mock.clock(on, { now: T0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.tool.call(WRITE)
  const calm = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(calm))?.props.source).not.toMatch(/animateTransform/)
  await calm.unmount()

  await $.tool.call({ tool: 'Write', file_path: '/a/big.ts', content: Array.from({ length: 1100 }, (_, i) => `const v${i} = ${i}`).join('\n') })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' } as any)
  expect((await bandSvg(band))?.props.source).toMatch(/animateTransform/)
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
    prefs: { style: 'classic' },
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
