import { expect, test } from 'claude-code/testing'

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

test('pane and band draw on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'linecount' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 1_700_000_000_000 }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/a/x.ts', content: '// c\nconst a = 1\n\nconst b = 2' })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect((await pane.find({ type: 'Text', text: /code lines this session/ }))?.text).toMatch(/2/)
    await pane.unmount()

    const band = await $.ui.mount({
      plugin: 'lines-tracker',
      component: 'AbovePrompt',
      requestId: 'band',
      props: { hasSurvey: false },
      surface,
    } as any)
    expect((await band.find({ type: 'Text', text: /LINES/ }))?.text).toMatch(/LINES/)
    await band.unmount()
  }
})
