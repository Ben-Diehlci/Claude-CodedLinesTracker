// The pane: a list of sections (each on or off in prefs) and the "Look" chooser at the bottom.
import type { Prefs } from '../types'
import { pack } from './clawd'
import { goalBar, heatStripCells } from './draw'
import { PANE_SVG, setMode } from './panesvg'
import { BACKGROUNDS, HEAT_WEEKS, OUTFIT_CHOICES, SECTIONS, backgroundOf, fmt } from './model'
import type { View } from './model'
import { CLAY, SAND } from './styles/common'
import type { Kit } from './styles/common'
import { DESIGNS, STYLE_CHOICES } from './styles'

const BLUE = '#7A8CE0'
const GREEN = '#7FB069'
const PINK = '#E86A9A'
const LANG_COLORS = [CLAY, SAND, BLUE, GREEN, PINK]
const MODEL_COLORS: Record<string, string> = { Opus: CLAY, Sonnet: SAND, Haiku: GREEN, Fable: BLUE }

const bar = (n: number, max: number, width: number): string =>
  '█'.repeat(max === 0 ? 0 : Math.max(n > 0 ? 1 : 0, Math.round((n / max) * width)))

export type PaneCtx = {
  kit: Kit
  v: View
  p: Prefs
  /** Sets one preference and saves it. */
  set: (patch: Partial<Prefs>) => Promise<void>
  /** Text colors for the chosen pane background (filled in by renderPane). */
  ink?: Ink
}

const when = (day: string): string => {
  const d = new Date(day + 'T12:00:00')

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

type Section = (c: PaneCtx) => any

const sections: Record<string, Section> = {
  header: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const mascot = v.mascot ? kit.raster() : null
    const head = (
      <Box flexDirection="column">
        <Text>
          <Text color={CLAY} bold>LINES CRAB </Text>
          <Text dimColor>{`LV ${v.level}`}</Text>
        </Text>
        <Text dimColor>{`${fmt(v.life.code)} lifetime, ${fmt(v.toNext)} to LV ${v.level + 1}`}</Text>
        <Text color={CLAY}>{goalBar(v.xp, 22)}</Text>
      </Box>
    )

    return mascot ? (
      <Box alignItems="center">
        {mascot}
        <Box marginLeft={1}>{head}</Box>
      </Box>
    ) : (
      head
    )
  },

  // Details: only what no other section shows (the terminal version; the desktop draws panesvg.ts detailsSvg).
  numbers: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const { code, comments, blank } = v.session
    const total = Math.max(1, code + comments + blank)
    const cells = 30
    const part = (n: number) => Math.round((n / total) * cells)

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>DETAILS THIS SESSION</Text>
        <Text>
          <Text color={CLAY}>{'█'.repeat(part(code))}</Text>
          <Text color={SAND}>{'█'.repeat(part(comments))}</Text>
          <Text dimColor>{'░'.repeat(part(blank))}</Text>
        </Text>
        <Text>
          <Text color={CLAY}>■</Text><Text dimColor>{` ${fmt(code)} code  `}</Text>
          <Text color={SAND}>■</Text><Text dimColor>{` ${fmt(comments)} comments  `}</Text>
          <Text dimColor>{`░ ${fmt(blank)} blank, not counted`}</Text>
        </Text>
        <Text>{`${v.files} files, ${v.writes} writes, ${v.edits} edits, ${fmt(Math.round(code / v.minutes))} code lines a minute`}</Text>
      </Box>
    )
  },

  rings: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const line = (label: string, total: number, models: [string, number][], earlier: number, earlierName: string) => (
      <Text>
        <Text bold>{fmt(total)}</Text>
        <Text dimColor>{` ${label}  `}</Text>
        {models.slice(0, 4).map(([m, n]) => (
          <Text>
            <Text color={MODEL_COLORS[m.split(' ')[0]] ?? PINK}>■</Text>
            <Text dimColor>{` ${m} ${fmt(n)}  `}</Text>
          </Text>
        ))}
        {earlier > 0 ? <Text dimColor>{`░ ${earlierName} ${fmt(earlier)}`}</Text> : <Text> </Text>}
      </Text>
    )

    return (
      <Box flexDirection="column">
        {line('lines today', v.today.code, v.modelsToday, v.earlierToday, 'earlier')}
        {line('all time', v.life.code, v.modelsLife, v.earlierLife, 'earlier')}
      </Box>
    )
  },

  heat: ({ kit, v }) => {
    const { Box, Text, Raster } = kit.ui
    const strip = heatStripCells(v.days, v.now, HEAT_WEEKS * 7)

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>{`LAST ${HEAT_WEEKS} WEEKS`}</Text>
        <Raster key="heat" columns={strip.columns} rows={1} cells={pack(strip.cells)} />
        <Text dimColor>
          {`${v.streak}-day streak (best ${v.bestStreak}).`}
          {v.best ? ` Busiest day: ${when(v.best.day)}, ${fmt(v.best.code)} lines.` : ''}
        </Text>
      </Box>
    )
  },

  sessions: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const max = Math.max(1, ...v.rows.map(r => r.code))

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>SESSIONS RIGHT NOW</Text>
        {v.rows.length === 0 ? <Text dimColor>this session only</Text> : null}
        {v.rows.map(r => (
          <Text>
            <Text color={r.active ? CLAY : undefined} dimColor={!r.active}>{r.hot ? '◉' : '●'}</Text> {r.name} <Text color={SAND}>{bar(r.code, max, 10)}</Text> <Text dimColor>{fmt(r.code)}</Text>
          </Text>
        ))}
      </Box>
    )
  },

  languages: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const total = v.byExt.reduce((n, [, c]) => n + c, 0)
    const cells = 30

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>LANGUAGES</Text>
        <Text>
          {v.byExt.map(([, n], i) => (
            <Text color={LANG_COLORS[i % LANG_COLORS.length]}>{bar(n, total, cells)}</Text>
          ))}
        </Text>
        <Text>
          {v.byExt.map(([ext, n], i) => (
            <Text><Text color={LANG_COLORS[i % LANG_COLORS.length]}>■</Text><Text dimColor>{` .${ext} ${fmt(n)}  `}</Text></Text>
          ))}
        </Text>
      </Box>
    )
  },

  files: ({ kit, v }) => {
    const { Box, Text } = kit.ui

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>BIGGEST FILES</Text>
        {v.byFile.map(([path, n]) => (
          <Text><Text color={SAND}>{bar(n, v.byFile[0][1], 12)}</Text> {path.split('/').pop()} {fmt(n)}</Text>
        ))}
      </Box>
    )
  },

  badges: ({ kit, v }) => {
    const { Box, Text } = kit.ui

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>BADGES</Text>
        <Box flexWrap="wrap" columnGap={2}>
          {v.badges.map(b => (
            <Text color={b.got ? CLAY : undefined} dimColor={!b.got} bold={b.got}>{`${b.got ? '●' : '○'} ${b.label}`}</Text>
          ))}
        </Box>
      </Box>
    )
  },
}

/** Text props for a pane background: the app's own colors, or fixed ones that read on a fixed background. */
type Ink = { fg: Record<string, unknown>; mu: Record<string, unknown>; sand: string }

const inkFor = (mode: string): Ink =>
  mode === 'light'
    ? { fg: { color: '#1F1E1D' }, mu: { color: '#6B6A64' }, sand: '#A98049' }
    : mode === 'dark'
      ? { fg: { color: '#F5F4EE' }, mu: { color: '#C2C0B6' }, sand: '#E3C79A' }
      : { fg: {}, mu: { dimColor: true }, sand: '#B8925A' }

const next = <T,>(list: readonly T[], cur: T): T => list[(list.indexOf(cur) + 1) % list.length]

/** The "Look" area: toggles, design and outfit pickers (cycle buttons on mobile), and one switch per section. */
const look = ({ kit, v, p, set, ink = inkFor('auto') }: PaneCtx) => {
  const { Box, Button, Select, Text } = kit.ui
  const picker = v.surface !== 'mobile' && Select
  const styleName = (id: string) =>
    id === 'auto' ? 'Auto' : id === 'random' ? 'Random each chat' : (DESIGNS.find(d => d.id === id)?.name ?? id)
  const bgIds = BACKGROUNDS.map(b => b.id as string)
  // The label is our own Text (not the Select's), so it can take the background's text color.
  const pick = (key: string, label: string, value: string, options: { value: string; label: string }[], onSelect: (value: string) => Promise<void>) => (
    <Box key={`row-${key}`} alignItems="center">
      <Text {...ink.fg}>{`${label} `}</Text>
      <Select key={key} value={value} options={options} onSelect={onSelect} />
    </Box>
  )

  const btn = (key: string, label: string, onPress: () => Promise<void>) => <Button key={key} label={label} onPress={onPress} />

  const toggles = (
    <Box flexWrap="wrap">
      {btn('status', `Band: ${p.status ? 'on' : 'off'}`, () => set({ status: !p.status }))}
      {btn('mascot', ` Mascot: ${p.mascot ? 'on' : 'off'}`, () => set({ mascot: !p.mascot }))}
      {btn('pane', ` Pane on start: ${p.pane ? 'on' : 'off'}`, () => set({ pane: !p.pane }))}
    </Box>
  )

  return (
    <Box flexDirection="column">
      {toggles}
      <Text> </Text>
      <Text color={ink.sand} bold>LOOK</Text>
      {picker ? (
        <Box flexDirection="column">
          {pick('style', 'Band design', p.style, STYLE_CHOICES.map(id => ({ value: id, label: styleName(id) })), value => set({ style: value }))}
          {pick('outfit', 'Clawd outfit', p.outfit, OUTFIT_CHOICES.map(id => ({ value: id, label: id })), value => set({ outfit: value }))}
          {v.surface !== 'terminal'
            ? pick('bg', 'Pane background', p.bg, BACKGROUNDS.map(b => ({ value: b.id, label: b.label })), value => set({ bg: value }))
            : null}
        </Box>
      ) : (
        <Box flexWrap="wrap">
          {btn('style', `Design: ${styleName(p.style)}`, () => set({ style: next(STYLE_CHOICES, p.style) }))}
          {btn('outfit', ` Outfit: ${p.outfit}`, () => set({ outfit: next(OUTFIT_CHOICES, p.outfit) }))}
          {btn('bg', ` Background: ${backgroundOf(p.bg).label}`, () => set({ bg: next(bgIds, backgroundOf(p.bg).id) }))}
        </Box>
      )}
      <Text {...ink.mu}>Sections</Text>
      <Box flexWrap="wrap">
        {SECTIONS.map(s => (
          btn(`sec-${s.id}`, `${s.label}: ${p.sections[s.id] !== false ? 'on' : 'off'} `, () => set({ sections: { ...p.sections, [s.id]: p.sections[s.id] === false } }))
        ))}
      </Box>
    </Box>
  )
}

/** Desktop pane width: the pane's column in pixels, less a margin. */
const paneWidth = (cols: number): number => Math.max(240, Math.min(1600, cols * 8 - 24))

export const renderPane = (ctx: PaneCtx) => {
  const { Box, Svg } = ctx.kit.ui
  const on = SECTIONS.filter(s => ctx.p.sections[s.id] !== false)
  const w = paneWidth(ctx.v.cols)
  // The terminal keeps its own background; elsewhere a chosen one fills the pane and fixes light or dark.
  const bg = ctx.v.surface === 'terminal' ? backgroundOf('none') : backgroundOf(ctx.p.bg)
  setMode(bg.mode)
  const c: PaneCtx = { ...ctx, ink: inkFor(bg.mode) }
  const body = on.map(s => {
    const draw = c.v.surface !== 'terminal' && Svg ? PANE_SVG[s.id] : undefined
    if (!draw) {
      return (
        <Box key={s.id} flexDirection="column" marginBottom={1}>
          {sections[s.id](c)}
        </Box>
      )
    }
    const pc = draw(c.v, w)

    return (
      <Box key={s.id} flexDirection="column" marginBottom={1}>
        <Svg key={`svg-${s.id}`} alt={pc.alt} isInteractive width={w} height={pc.h} source={pc.src} />
      </Box>
    )
  })
  // The settings hide behind one Settings button (the app's highlighted button reads on any fill).
  const { Button } = ctx.kit.ui
  const open = ctx.p.lookOpen
  const toggle = (
    <Box key="settings-row" marginBottom={1}>
      <Button key="settings" variant="primary" label={open ? 'Hide settings' : 'Settings'} onPress={() => ctx.set({ lookOpen: !open })} />
    </Box>
  )
  const controls = open ? look({ ...ctx, ink: inkFor('auto') }) : null
  if (!bg.color) {
    return (
      <Box flexDirection="column" paddingX={1}>
        {body}
        {toggle}
        {controls}
      </Box>
    )
  }

  // A filled pane: the color fills it all. Opened, the settings show below the fill, on the app's own
  // background, where the app's buttons and menus (whose colors a plugin cannot set) read.

  // Closed, the fill is at least as tall as the pane's room, so the whole pane takes the color
  // ('100%' was ignored by the desktop pane).
  const stretch = open || !ctx.v.paneRows ? {} : { minHeight: ctx.v.paneRows }

  return (
    <Box flexDirection="column">
      <Box key="fill" flexDirection="column" backgroundColor={bg.color} paddingX={1} paddingTop={1} {...stretch}>
        {body}
        {toggle}
      </Box>
      {open ? (
        <Box key="settings-area" flexDirection="column" paddingX={1} paddingTop={1}>
          {controls}
        </Box>
      ) : null}
    </Box>
  )
}
