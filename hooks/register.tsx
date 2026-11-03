import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Counts, Prefs, Pulse, Stats, Totals } from '../types'
import {
  CELL_ROWS,
  HOP_MS,
  SLEEP_MS,
  W,
  clawdCells,
  clawdSvg,
  frame,
  newAnim,
  sparkCells,
  sparkSvg,
} from './clawd'
import { countLines, extOf } from './count'

const PANE = 'lines-tracker'
const FRAMES = ['(o_o)', '(o_O)', '(O_o)', '(^_^)']
const EMPTY: Counts = { all: 0, code: 0, comments: 0, blank: 0 }

// The "clay" palette.
const CLAY = '#D97757'
const SAND = '#E3C79A'
const FLASH = '#7FB069'

const REFRESH_MS = 5000
const ACTIVE_MS = 90_000
const FOLD_AGE_MS = 60 * 60_000
const FLASH_MS = 3000
const PREFIX = 's-'

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
const totals = atom(
  { plugin: 'lines-tracker', key: 'totals' } as const,
  { life: { ...EMPTY }, today: { ...EMPTY }, days: {}, sessions: 1 } as Totals,
  { shape: 'totals-2' },
)
const pulse = atom({ plugin: 'lines-tracker', key: 'pulse' } as const, { at: 0, n: 0 } as Pulse, {
  shape: 'pulse-1',
})

const add = (a: Counts, b: Counts): Counts => ({
  all: a.all + b.all,
  code: a.code + b.code,
  comments: a.comments + b.comments,
  blank: a.blank + b.blank,
})

const fmt = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const bar = (n: number, max: number, width: number): string =>
  '█'.repeat(max === 0 ? 0 : Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)))

const top = (map: Record<string, number>, n: number): [string, number][] =>
  Object.entries(map)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)

const day = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const lastDays = (now: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => day(now - (n - 1 - i) * 86_400_000))

/* ---- the store: one key per session (written only by its owner), summed on read ---- */

type Own = { t: number; life: Counts; days: Record<string, Counts> }
type Base = { life: Counts; days: Record<string, Counts>; folded: string[] }

const keepDays = (days: Record<string, Counts>, n: number): Record<string, Counts> => {
  const out: Record<string, Counts> = {}
  for (const k of Object.keys(days).sort().slice(-n)) out[k] = days[k]

  return out
}

// Totals folded from finished sessions. Older versions kept plain 'lifetime' and 'days' keys: seed from them.
const loadBase = async ($: any): Promise<Base> => {
  const b = (await $.store.get('base')) as Base | undefined
  if (b) return b

  return {
    life: ((await $.store.get('lifetime')) as Counts | undefined) ?? { ...EMPTY },
    days: ((await $.store.get('days')) as Record<string, Counts> | undefined) ?? {},
    folded: [],
  }
}

const sumSessions = async ($: any, now: number): Promise<Totals> => {
  const base = await loadBase($)
  const folded = new Set(base.folded)
  let life = base.life
  const days = { ...base.days }
  let sessions = 0
  for (const k of (await $.store.keys()) as string[]) {
    if (!k.startsWith(PREFIX) || folded.has(k)) continue
    const o = (await $.store.get(k)) as Own | undefined
    if (!o) continue
    life = add(life, o.life)
    for (const d of Object.keys(o.days)) days[d] = add(days[d] ?? EMPTY, o.days[d])
    if (now - o.t < ACTIVE_MS) sessions++
  }

  return { life, today: days[day(now)] ?? { ...EMPTY }, days: keepDays(days, 30), sessions: Math.max(1, sessions) }
}

// At session start: sessions idle for an hour move into 'base', so the store stays small.
const fold = async ($: any, self: string, now: number) => {
  const base = await loadBase($)
  const folded = new Set(base.folded)
  const done: string[] = []
  let life = base.life
  const days = { ...base.days }
  for (const k of (await $.store.keys()) as string[]) {
    if (!k.startsWith(PREFIX) || k === self) continue
    const o = (await $.store.get(k)) as Own | undefined
    if (!o) continue
    if (!folded.has(k)) {
      if (now - o.t < FOLD_AGE_MS) continue
      life = add(life, o.life)
      for (const d of Object.keys(o.days)) days[d] = add(days[d] ?? EMPTY, o.days[d])
    }
    done.push(k)
  }
  if (done.length === 0) return
  await $.store.set('base', { life, days: keepDays(days, 60), folded: [...base.folded, ...done].slice(-500) })
  for (const k of done) await $.store.delete(k)
}

// Animation state (terminal drawing; the desktop plays its own timeline).
const anim = newAnim(0)
let lastActive = 0
let flashShown = false
let asleepShown = false
let lastCells = ''
let ownCache: Own | undefined
let beats = 0
const mounted: Record<'band' | 'pane', boolean> = { band: false, pane: false }
let bandId = 'band'

const clawdEl = ($: any, e: any, px: number, hop: boolean, key: string, now: number) => {
  const { Raster, Svg } = $.ui.resolve(e) as any
  if (e.surface === 'terminal') {
    return (
      <Raster key={key} columns={W} rows={CELL_ROWS} cells={clawdCells(frame(anim, now))} />
    )
  }

  return (
    <Svg
      key={key}
      alt="Clawd the pixel crab"
      isInteractive
      width={W * px}
      height={CELL_ROWS * 2 * px}
      source={clawdSvg(px, { working: anim.working, asleep: anim.asleep, hop })}
    />
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

  // Only this session writes its own key, so two sessions can never lose each other's counts.
  const key = PREFIX + (await $.session.id())
  const own = ((await $.store.get(key)) as Own | undefined) ?? { t: now, life: { ...EMPTY }, days: {} }
  const d = day(now)
  ownCache = {
    t: now,
    life: add(own.life, counts),
    days: keepDays({ ...own.days, [d]: add(own.days[d] ?? EMPTY, counts) }, 30),
  }
  await $.store.set(key, ownCache)

  lastActive = now
  anim.asleep = false
  anim.hopUntil = now + HOP_MS
  await update($, pulse, () => ({ at: now, n: counts.code }))
  await syncTotals($, now)
}

const syncTotals = async ($: any, now: number) => {
  const next = await sumSessions($, now)
  const cur = await read($, totals)
  if (JSON.stringify(cur) !== JSON.stringify(next)) await update($, totals, () => next)
}

// Every few seconds: show other sessions' lines, keep this session's key alive, redraw on a timed change.
const refresh = async ($: any) => {
  const now = await $.clock.now()
  const key = PREFIX + (await $.session.id())
  if (ownCache && (++beats % 6 === 0 || !((await $.store.keys()) as string[]).includes(key))) {
    ownCache = { ...ownCache, t: now }
    await $.store.set(key, ownCache)
  }
  await syncTotals($, now)

  const asleep = now - lastActive > SLEEP_MS
  const p = await read($, pulse)
  const flashing = now - p.at < FLASH_MS
  if (asleep !== asleepShown || flashing !== flashShown) {
    asleepShown = asleep
    flashShown = flashing
    anim.asleep = asleep
    $.ui.invalidate('ui.render')
  }
}

// Terminal only: repaint the Raster Clawd in place, no redraw.
const tickAnim = async ($: any) => {
  if (!mounted.band && !mounted.pane) return
  const now = await $.clock.now()
  anim.asleep = now - lastActive > SLEEP_MS
  const cells = clawdCells(frame(anim, now))
  if (cells === lastCells) return
  lastCells = cells
  const targets: ['band' | 'pane', string][] = [['band', bandId], ['pane', PANE]]
  for (const [name, requestId] of targets) {
    if (!mounted[name]) continue
    const r = await $.ui.blit({ requestId, key: 'clawd', cells })
    if ('deny' in r) mounted[name] = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('prefs')) as Prefs | undefined
    if (saved) await update($, prefs, () => ({ status: true, pane: true, mascot: true, ...saved }))

    const now = await $.clock.now()
    Object.assign(anim, newAnim(now))
    lastActive = now
    const self = PREFIX + (await $.session.id())
    await fold($, self, now)
    ownCache = ((await $.store.get(self)) as Own | undefined) ?? undefined
    await syncTotals($, now)

    await $.command.register({
      name: 'linecount',
      description: 'Lines tracker: /linecount [show|status|pane|mascot|reset] [on|off]',
    })

    // Local timers only: no model call, nothing sent to the model.
    $.clock.every(REFRESH_MS, () => void refresh($).catch(() => {}))
    $.clock.every(120, () => void tickAnim($).catch(() => {}))

    const p = await read($, prefs)
    if (p.pane) void $.ui.open({ id: PANE, title: 'Lines written' })

    return next(e)
  })

  on('command.run', { command: 'linecount' }, async ($, e) => {
    const [what = 'show', value] = e.args.trim().split(/\s+/)
    const keys = ['status', 'pane', 'mascot'] as const

    if (what === 'reset') {
      await update($, session, () => fresh(0))

      return { text: 'Session line counts reset. Lifetime totals are kept.' }
    }

    if ((keys as readonly string[]).includes(what)) {
      const key = what as (typeof keys)[number]
      const now = value === 'on' ? true : value === 'off' ? false : !(await read($, prefs))[key]
      await update($, prefs, (p: Prefs) => ({ ...p, [key]: now }))
      await $.store.set('prefs', await read($, prefs))
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

  // The band above the prompt: Clawd on the left, the numbers beside him.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.status || e.props.hasSurvey) {
      mounted.band = false

      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e) as any
    const s = await read($, session)
    const t = await read($, totals)
    const pu = await read($, pulse)
    const now = await $.clock.now()

    anim.working = e.props.isWorking
    anim.asleep = now - lastActive > SLEEP_MS
    mounted.band = p.mascot && e.surface === 'terminal'
    if (mounted.band) {
      bandId = (e as { requestId?: string }).requestId ?? 'band'
      lastCells = ''
    }
    const flash = now - pu.at < FLASH_MS ? pu.n : 0
    const multi = t.sessions > 1

    const stats = (
      <Box flexDirection="column">
        <Text>
          <Text color={CLAY} bold>{'LINES '}</Text>
          <Text color={CLAY} bold>{fmt(s.total.code)}</Text>
          <Text dimColor> code  </Text>
          <Text color={SAND} bold>{fmt(s.total.all)}</Text>
          <Text dimColor> with comments</Text>
          {flash > 0 ? <Text color={FLASH} bold>{`  +${fmt(flash)}`}</Text> : <Text> </Text>}
        </Text>
        <Text>
          <Text dimColor>{multi ? 'all sessions today ' : 'today '}</Text>
          <Text color="white" bold>{fmt(t.today.code)}</Text>
          <Text dimColor>  all time </Text>
          <Text color="white" bold>{fmt(t.life.code)}</Text>
          {multi ? <Text dimColor>{`  ${t.sessions} sessions active`}</Text> : <Text> </Text>}
        </Text>
      </Box>
    )

    if (!p.mascot) return <Box paddingX={1}>{stats}</Box>

    return (
      <Box paddingX={1} alignItems="center">
        {clawdEl($, e, 4, now - pu.at < HOP_MS, 'clawd', now)}
        <Box marginLeft={1}>{stats}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.mascot) return next(e)

    const s = await read($, session)
    const now = await $.clock.now()
    lastActive = now
    const frameFace = FRAMES[Math.floor(now / 400) % FRAMES.length]

    return next({
      ...e,
      props: { ...e.props, suffix: ` ${frameFace} ${fmt(s.total.code)} lines` },
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text, Raster, Svg } = $.ui.resolve(e) as any
    const s = await read($, session)
    const p = await read($, prefs)
    const t = await read($, totals)
    const now = await $.clock.now()
    const minutes = Math.max(1, (now - (s.startedAt || now)) / 60000)
    const exts = top(s.byExt, 5)
    const files = top(s.byFile, 5)
    const spark = lastDays(now, 30).map(d => t.days[d]?.code ?? 0)
    const flip = (key: keyof Prefs) => async () => {
      await update($, prefs, (x: Prefs) => ({ ...x, [key]: !x[key] }))
      await $.store.set('prefs', await read($, prefs))
    }

    mounted.pane = p.mascot && e.surface === 'terminal'
    if (mounted.pane) lastCells = ''

    const head = (
      <Box flexDirection="column">
        <Text color={CLAY} bold>LINES WRITTEN</Text>
        <Text dimColor>{`this session, ${Math.round(minutes)} min`}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        {p.mascot ? (
          <Box alignItems="center">
            {clawdEl($, e, 5, false, 'clawd', now)}
            <Box marginLeft={1}>{head}</Box>
          </Box>
        ) : (
          head
        )}
        <Text> </Text>
        <Text color={CLAY} bold>{fmt(s.total.code)} <Text dimColor>code lines this session</Text></Text>
        <Text color={CLAY}>{bar(s.total.code, s.total.all, 24)}</Text>
        <Text color={SAND} bold>{fmt(s.total.all)} <Text dimColor>with comments</Text></Text>
        <Text color={SAND}>{bar(s.total.all, s.total.all, 24)}</Text>
        <Text dimColor>{fmt(s.total.comments)} comment lines, {fmt(s.total.blank)} blank skipped</Text>
        <Text> </Text>
        <Text color={SAND} bold>LAST 30 DAYS</Text>
        {e.surface === 'terminal' ? (
          <Raster key="spark" columns={30} rows={3} cells={sparkCells(spark, 3)} />
        ) : (
          <Svg key="spark" alt="Code lines per day, last 30 days" width={300} height={44} source={sparkSvg(spark, 300, 44)} />
        )}
        <Text bold>{t.sessions > 1 ? 'All sessions today ' : 'Today '}<Text color="white">{fmt(t.today.code)} / {fmt(t.today.all)}</Text></Text>
        <Text bold>All time <Text color="white">{fmt(t.life.code)} / {fmt(t.life.all)}</Text></Text>
        <Text dimColor>(code / with comments){t.sessions > 1 ? `, ${t.sessions} sessions active` : ''}</Text>
        <Text> </Text>
        <Text bold>{Object.keys(s.byFile).length} files, {s.writes} writes, {s.edits} edits</Text>
        <Text bold>Pace <Text color={CLAY}>{Math.round(s.total.code / minutes)}</Text> code lines/min</Text>
        <Text> </Text>
        <Text color={SAND} bold>BY TYPE</Text>
        {exts.map(([ext, n]) => (
          <Text><Text color={CLAY}>{bar(n, exts[0][1], 12)}</Text> .{ext} {fmt(n)}</Text>
        ))}
        <Text> </Text>
        <Text color={SAND} bold>BIGGEST FILES</Text>
        {files.map(([path, n]) => (
          <Text><Text color={SAND}>{bar(n, files[0][1], 12)}</Text> {path.split('/').pop()} {fmt(n)}</Text>
        ))}
        <Text> </Text>
        <Box>
          <Button key="status" label={`Band: ${p.status ? 'on' : 'off'}`} onPress={flip('status')} />
          <Button key="mascot" label={` Mascot: ${p.mascot ? 'on' : 'off'}`} onPress={flip('mascot')} />
          <Button key="pane" label={` Pane on start: ${p.pane ? 'on' : 'off'}`} onPress={flip('pane')} />
        </Box>
      </Box>
    )
  })
}
