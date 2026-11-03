import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Counts, Prefs, Stats } from '../types'
import { countLines, extOf } from './count'

const PANE = 'lines-tracker'
const FRAMES = ['(o_o)', '(o_O)', '(O_o)', '(^_^)']
const EMPTY: Counts = { all: 0, code: 0, comments: 0, blank: 0 }

const fresh = (now: number): Stats => ({
  total: { ...EMPTY },
  writes: 0,
  edits: 0,
  byExt: {},
  byFile: {},
  startedAt: now,
})

// Change a tag when the fields of its value change: an older stored value is
// then read as the initial one.
const session = atom({ plugin: 'lines-tracker', key: 'session' } as const, fresh(0), {
  shape: 'stats-1',
})
const prefs = atom(
  { plugin: 'lines-tracker', key: 'prefs' } as const,
  { status: true, pane: true, mascot: true } as Prefs,
  { shape: 'prefs-1' },
)

const add = (a: Counts, b: Counts): Counts => ({
  all: a.all + b.all,
  code: a.code + b.code,
  comments: a.comments + b.comments,
  blank: a.blank + b.blank,
})

const fmt = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const top = (map: Record<string, number>, n: number): [string, number][] =>
  Object.entries(map)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const readLifetime = async ($: any): Promise<Counts> =>
  ((await $.store.get('lifetime')) as Counts | undefined) ?? { ...EMPTY }

const readDays = async ($: any): Promise<Record<string, Counts>> =>
  ((await $.store.get('days')) as Record<string, Counts> | undefined) ?? {}

const refreshStatus = async ($: any) => {
  const p = await read($, prefs)
  const s = await read($, session)
  $.ui.status(
    p.status
      ? `lines: ${fmt(s.total.code)} code / ${fmt(s.total.all)} with comments`
      : undefined,
  )
}

const record = async ($: any, path: string, text: string, kind: 'writes' | 'edits') => {
  const ext = extOf(path)
  const counts = countLines(text, ext)
  const now = await $.clock.now()

  await update($, session, (s: Stats) => ({
    ...s,
    startedAt: s.startedAt || now,
    total: add(s.total, counts),
    [kind]: s[kind] + 1,
    byExt: { ...s.byExt, [ext]: (s.byExt[ext] ?? 0) + counts.code },
    byFile: { ...s.byFile, [path]: (s.byFile[path] ?? 0) + counts.all },
  }))

  await $.store.set('lifetime', add(await readLifetime($), counts))

  const days = await readDays($)
  const key = day(now)
  const keep = Object.keys(days).sort().slice(-29)
  const next: Record<string, Counts> = {}
  for (const k of keep) if (k !== key) next[k] = days[k]
  next[key] = add(days[key] ?? EMPTY, counts)
  await $.store.set('days', next)

  await refreshStatus($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('prefs')) as Prefs | undefined
    if (saved) await update($, prefs, () => ({ status: true, pane: true, mascot: true, ...saved }))

    await $.command.register({
      name: 'linecount',
      description: 'Lines tracker: /linecount [show|status|pane|mascot|reset] [on|off]',
    })

    const p = await read($, prefs)
    if (p.pane) void $.ui.open({ id: PANE, title: 'Lines written' })
    await refreshStatus($)

    return next(e)
  })

  on('command.run', { command: 'linecount' }, async ($, e) => {
    const [what = 'show', value] = e.args.trim().split(/\s+/)
    const keys = ['status', 'pane', 'mascot'] as const

    if (what === 'reset') {
      await update($, session, () => fresh(0))
      await refreshStatus($)

      return { text: 'Session line counts reset. Lifetime totals are kept.' }
    }

    if ((keys as readonly string[]).includes(what)) {
      const key = what as (typeof keys)[number]
      const now = value === 'on' ? true : value === 'off' ? false : !(await read($, prefs))[key]
      await update($, prefs, (p: Prefs) => ({ ...p, [key]: now }))
      await $.store.set('prefs', { ...(await read($, prefs)), [key]: now })
      await refreshStatus($)
      if (key === 'pane' && now) await $.ui.open({ id: PANE, title: 'Lines written' })

      return { text: `${key}: ${now ? 'on' : 'off'}` }
    }

    await $.ui.open({ id: PANE, title: 'Lines written' })
    const s = await read($, session)

    return {
      text: `Session: ${fmt(s.total.code)} code, ${fmt(s.total.all)} with comments, ${fmt(s.total.blank)} blank skipped.`,
    }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.file_path, e.content, 'writes')
    }

    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.file_path, e.new_string, 'edits')
    }

    return ran
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.mascot) return next(e)

    const s = await read($, session)
    const frame = FRAMES[Math.floor((await $.clock.now()) / 400) % FRAMES.length]

    return next({
      ...e,
      props: { ...e.props, suffix: ` ${frame} ${fmt(s.total.code)} lines` },
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, session)
    const p = await read($, prefs)
    const life = await readLifetime($)
    const today = (await readDays($))[day(await $.clock.now())] ?? EMPTY
    const minutes = Math.max(1, ((await $.clock.now()) - (s.startedAt || (await $.clock.now()))) / 60000)
    const flip = (key: keyof Prefs) => async () => {
      await update($, prefs, (x: Prefs) => ({ ...x, [key]: !x[key] }))
      await $.store.set('prefs', await read($, prefs))
      await refreshStatus($)
    }

    return (
      <Box flexDirection="column">
        <Text bold>This session</Text>
        <Text>  code only:           {fmt(s.total.code)}</Text>
        <Text>  with comments:       {fmt(s.total.all)}</Text>
        <Text>  comment lines:       {fmt(s.total.comments)}</Text>
        <Text dimColor>  blank (skipped):     {fmt(s.total.blank)}</Text>
        <Text>  files: {Object.keys(s.byFile).length}   writes: {s.writes}   edits: {s.edits}</Text>
        <Text>  pace: {Math.round(s.total.code / minutes)} code lines/min</Text>
        <Text bold>Today</Text>
        <Text>  {fmt(today.code)} code / {fmt(today.all)} with comments</Text>
        <Text bold>All time</Text>
        <Text>  {fmt(life.code)} code / {fmt(life.all)} with comments</Text>
        <Text bold>By type (code lines)</Text>
        {top(s.byExt, 5).map(([ext, n]) => (
          <Text>  .{ext}  {fmt(n)}</Text>
        ))}
        <Text bold>Biggest files</Text>
        {top(s.byFile, 5).map(([path, n]) => (
          <Text>  {fmt(n)}  {path.split('/').pop()}</Text>
        ))}
        <Box>
          <Button key="status" label={`Status line: ${p.status ? 'on' : 'off'}`} onPress={flip('status')} />
          <Button key="mascot" label={` Mascot: ${p.mascot ? 'on' : 'off'}`} onPress={flip('mascot')} />
        </Box>
      </Box>
    )
  })
}
