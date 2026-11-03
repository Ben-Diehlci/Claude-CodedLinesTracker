// The pane: a list of sections (each on or off in prefs) and the "Look" chooser at the bottom.
import type { Prefs } from '../types'
import { pack, sparkCells, sparkSvg } from './clawd'
import { goalBar, heatCellsRaw } from './draw'
import { PANE_SVG, setMode } from './panesvg'
import { BACKGROUNDS, OUTFIT_CHOICES, SECTIONS, backgroundOf, fmt, lastDays } from './model'
import type { View } from './model'
import { CLAY, SAND } from './styles/common'
import type { Kit } from './styles/common'
import { DESIGNS, STYLE_CHOICES } from './styles'

const BLUE = '#7A8CE0'
const GREEN = '#7FB069'
const PINK = '#E86A9A'
const LANG_COLORS = [CLAY, SAND, BLUE, GREEN, PINK]
const GOALS = [250, 500, 1000, 2000]

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

  numbers: ({ kit, v, ink = inkFor('auto') }) => {
    const { Box, Text, Raster, Svg } = kit.ui
    const spark = lastDays(v.now, 30).map(d => v.days[d]?.code ?? 0)
    const { fg, mu } = ink

    return (
      <Box flexDirection="column">
        <Text color={CLAY} bold>{fmt(v.session.code)} <Text {...mu}>code lines this session</Text></Text>
        <Text color={CLAY}>{bar(v.session.code, v.session.all, 24)}</Text>
        <Text color={ink.sand} bold>{fmt(v.session.all)} <Text {...mu}>with comments</Text></Text>
        <Text color={ink.sand}>{bar(v.session.all, v.session.all, 24)}</Text>
        <Text {...mu}>{fmt(v.session.comments)} comment lines, {fmt(v.session.blank)} blank skipped</Text>
        <Text> </Text>
        <Text color={ink.sand} bold>LAST 30 DAYS</Text>
        {v.surface === 'terminal' ? (
          <Raster key="spark" columns={30} rows={3} cells={sparkCells(spark, 3)} />
        ) : (
          <Svg key="spark" alt="Code lines per day, last 30 days" width={300} height={44} source={sparkSvg(spark, 300, 44)} />
        )}
        <Text {...fg} bold>{v.sessions > 1 ? 'All sessions today ' : 'Today '}{fmt(v.today.code)} / {fmt(v.today.all)}</Text>
        <Text {...fg} bold>All time {fmt(v.life.code)} / {fmt(v.life.all)}</Text>
        <Text {...mu}>(code / with comments){v.sessions > 1 ? `, ${v.sessions} sessions active` : ''}</Text>
        <Text> </Text>
        <Text {...fg} bold>{v.files} files, {v.writes} writes, {v.edits} edits</Text>
        <Text {...fg} bold>Pace <Text color={CLAY}>{Math.round(v.session.code / v.minutes)}</Text> code lines/min</Text>
      </Box>
    )
  },

  rings: ({ kit, v }) => {
    const { Box, Text } = kit.ui
    const share = v.session.all ? v.session.code / v.session.all : 0

    return (
      <Box flexDirection="column">
        <Text><Text color={CLAY}>{goalBar(share, 12)}</Text> <Text bold>{Math.round(share * 100)}%</Text><Text dimColor> of this session is code</Text></Text>
        <Text><Text color={v.goalFrac >= 1 ? GREEN : SAND}>{goalBar(v.goalFrac, 12)}</Text> <Text bold>{fmt(v.today.code)}</Text><Text dimColor>{` / ${fmt(v.goal)} today`}</Text></Text>
      </Box>
    )
  },

  heat: ({ kit, v }) => {
    const { Box, Text, Raster } = kit.ui

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>LAST 12 WEEKS</Text>
        <Raster key="heat" columns={12} rows={7} cells={pack(heatCellsRaw(v.days, v.now))} />
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

/** The "Look" area: toggles, design and outfit pickers (cycle buttons on mobile), goal, and one switch per section. */
const look = ({ kit, v, p, set, ink = inkFor('auto') }: PaneCtx) => {
  const { Box, Button, Select, Text } = kit.ui
  const picker = v.surface !== 'mobile' && Select
  const styleName = (id: string) => (id === 'auto' ? 'Auto' : (DESIGNS.find(d => d.id === id)?.name ?? id))
  const bgIds = BACKGROUNDS.map(b => b.id as string)
  // The label is our own Text (not the Select's), so it can take the background's text color.
  const pick = (key: string, label: string, value: string, options: { value: string; label: string }[], onSelect: (value: string) => Promise<void>) => (
    <Box key={`row-${key}`} alignItems="center">
      <Text {...ink.fg}>{`${label} `}</Text>
      <Select key={key} value={value} options={options} onSelect={onSelect} />
    </Box>
  )

  // On a chosen background the app's own button text can sink into it: draw the label as our Text, in the background's color.
  const btn = (key: string, label: string, onPress: () => Promise<void>) =>
    'color' in ink.fg ? (
      <Button key={key} label={label} onPress={onPress}>
        <Text {...ink.fg}>{label}</Text>
      </Button>
    ) : (
      <Button key={key} label={label} onPress={onPress} />
    )

  const toggles = (
    <Box flexWrap="wrap">
      {btn('status', `Band: ${p.status ? 'on' : 'off'}`, () => set({ status: !p.status }))}
      {btn('mascot', ` Mascot: ${p.mascot ? 'on' : 'off'}`, () => set({ mascot: !p.mascot }))}
      {btn('pane', ` Pane on start: ${p.pane ? 'on' : 'off'}`, () => set({ pane: !p.pane }))}
      {btn('goal', ` Goal: ${fmt(p.goal)}`, () => set({ goal: next(GOALS, GOALS.includes(p.goal) ? p.goal : GOALS[0]) }))}
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
const paneWidth = (cols: number): number => Math.max(240, Math.min(600, cols * 8 - 24))

export const renderPane = (ctx: PaneCtx) => {
  const { Box, Svg } = ctx.kit.ui
  const on = SECTIONS.filter(s => ctx.p.sections[s.id] !== false)
  const w = paneWidth(ctx.v.cols)
  // The terminal keeps its own background; elsewhere a chosen one fills the pane and fixes light or dark.
  const bg = ctx.v.surface === 'terminal' ? backgroundOf('none') : backgroundOf(ctx.p.bg)
  setMode(bg.mode)
  const c: PaneCtx = { ...ctx, ink: inkFor(bg.mode) }
  const fill = bg.color ? { backgroundColor: bg.color, paddingY: 1 } : {}

  return (
    <Box flexDirection="column" paddingX={1} {...fill}>
      {on.map(s => {
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
      })}
      {look(c)}
    </Box>
  )
}

