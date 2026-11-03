// The pane: a list of sections (each on or off in prefs) and the "Look" chooser at the bottom.
import type { Prefs } from '../types'
import { pack, sparkCells, sparkSvg } from './clawd'
import { goalBar, heatCellsRaw, heatMap, ring, svgDoc, text, rect } from './draw'
import { OUTFIT_CHOICES, SECTIONS, fmt, lastDays } from './model'
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
  /** Pixel size of Clawd in the header. */
  header: { px: number }
}

const when = (day: string): string => {
  const d = new Date(day + 'T12:00:00')

  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

type Section = (c: PaneCtx) => any

const sections: Record<string, Section> = {
  header: ({ kit, v, header }) => {
    const { Box, Text, Svg } = kit.ui
    const terminal = v.surface === 'terminal'
    const mascot = v.mascot
      ? terminal
        ? kit.raster()
        : <Svg key="clawd" alt="Clawd the pixel crab" isInteractive width={14 * header.px} height={(v.outfit === 'none' || v.outfit === 'shades' ? 8 : 10) * header.px} source={kit.clawdSvg(header.px)} />
      : null
    const xp = terminal ? (
      <Text color={CLAY}>{goalBar(v.xp, 22)}</Text>
    ) : (
      <Svg key="xp" alt={`${Math.round(v.xp * 100)}% to the next level`} width={200} height={10} source={svgDoc(200, 10, rect(0, 2, 200, 6, 'hf', 3) + rect(0, 2, Math.max(4, 200 * v.xp), 6, 'cf', 3))} />
    )
    const head = (
      <Box flexDirection="column">
        <Text>
          <Text color={CLAY} bold>LINES CRAB </Text>
          <Text dimColor>{`LV ${v.level}`}</Text>
        </Text>
        <Text dimColor>{`${fmt(v.life.code)} lifetime, ${fmt(v.toNext)} to LV ${v.level + 1}`}</Text>
        {xp}
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

  numbers: ({ kit, v }) => {
    const { Box, Text, Raster, Svg } = kit.ui
    const spark = lastDays(v.now, 30).map(d => v.days[d]?.code ?? 0)

    return (
      <Box flexDirection="column">
        <Text color={CLAY} bold>{fmt(v.session.code)} <Text dimColor>code lines this session</Text></Text>
        <Text color={CLAY}>{bar(v.session.code, v.session.all, 24)}</Text>
        <Text color={SAND} bold>{fmt(v.session.all)} <Text dimColor>with comments</Text></Text>
        <Text color={SAND}>{bar(v.session.all, v.session.all, 24)}</Text>
        <Text dimColor>{fmt(v.session.comments)} comment lines, {fmt(v.session.blank)} blank skipped</Text>
        <Text> </Text>
        <Text color={SAND} bold>LAST 30 DAYS</Text>
        {v.surface === 'terminal' ? (
          <Raster key="spark" columns={30} rows={3} cells={sparkCells(spark, 3)} />
        ) : (
          <Svg key="spark" alt="Code lines per day, last 30 days" width={300} height={44} source={sparkSvg(spark, 300, 44)} />
        )}
        <Text bold>{v.sessions > 1 ? 'All sessions today ' : 'Today '}<Text bold>{fmt(v.today.code)} / {fmt(v.today.all)}</Text></Text>
        <Text bold>All time <Text bold>{fmt(v.life.code)} / {fmt(v.life.all)}</Text></Text>
        <Text dimColor>(code / with comments){v.sessions > 1 ? `, ${v.sessions} sessions active` : ''}</Text>
        <Text> </Text>
        <Text bold>{v.files} files, {v.writes} writes, {v.edits} edits</Text>
        <Text bold>Pace <Text color={CLAY}>{Math.round(v.session.code / v.minutes)}</Text> code lines/min</Text>
      </Box>
    )
  },

  rings: ({ kit, v }) => {
    const { Box, Text, Svg } = kit.ui
    const share = v.session.all ? v.session.code / v.session.all : 0
    if (v.surface === 'terminal') {
      return (
        <Box flexDirection="column">
          <Text><Text color={CLAY}>{goalBar(share, 12)}</Text> <Text bold>{Math.round(share * 100)}%</Text><Text dimColor> of this session is code</Text></Text>
          <Text><Text color={v.goalFrac >= 1 ? GREEN : SAND}>{goalBar(v.goalFrac, 12)}</Text> <Text bold>{fmt(v.today.code)}</Text><Text dimColor>{` / ${fmt(v.goal)} today`}</Text></Text>
        </Box>
      )
    }
    const card = (x: number, frac: number, cls: string, big: string, bigCls: string, l1: string, l2: string) =>
      `<rect x="${x + 0.5}" y="0.5" width="144" height="63" rx="10" fill="none" class="hs"/>` +
      ring(x + 32, 32, 18, frac, cls) +
      text(x + 58, 31, big, { cls: bigCls, size: 20, bold: true }) +
      text(x + 58, 46, l1, { cls: 'mu', size: 11 }) +
      text(x + 58, 58, l2, { cls: 'mu', size: 11 })
    const src =
      card(0, share, 'cs', fmt(v.session.code), 'cl', 'code this session', `${Math.round(share * 100)}% of lines`) +
      card(152, v.goalFrac, v.goalFrac >= 1 ? 'ls' : 'ss', fmt(v.today.code), 'fg', `today, goal ${fmt(v.goal)}`, 'all sessions')

    return (
      <Box flexDirection="column">
        <Svg key="rings" alt={`${fmt(v.session.code)} code lines this session, ${fmt(v.today.code)} of ${fmt(v.goal)} today`} width={300} height={64} source={svgDoc(300, 64, src)} />
      </Box>
    )
  },

  heat: ({ kit, v }) => {
    const { Box, Text, Raster, Svg } = kit.ui
    const note = (
      <Text dimColor>
        {`${v.streak}-day streak (best ${v.bestStreak}).`}
        {v.best ? ` Busiest day: ${when(v.best.day)}, ${fmt(v.best.code)} lines.` : ''}
      </Text>
    )

    return (
      <Box flexDirection="column">
        <Text color={SAND} bold>LAST 12 WEEKS</Text>
        {v.surface === 'terminal' ? (
          <Raster key="heat" columns={12} rows={7} cells={pack(heatCellsRaw(v.days, v.now))} />
        ) : (
          <Svg key="heat" alt="Lines per day, last 12 weeks" width={12 * 15} height={7 * 15} source={svgDoc(12 * 15, 7 * 15, heatMap(0, 0, v.days, v.now))} />
        )}
        {note}
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

const next = <T,>(list: readonly T[], cur: T): T => list[(list.indexOf(cur) + 1) % list.length]

/** The "Look" area: toggles, design and outfit pickers (cycle buttons on mobile), goal, and one switch per section. */
const look = ({ kit, v, p, set }: PaneCtx) => {
  const { Box, Button, Select, Text } = kit.ui
  const picker = v.surface !== 'mobile' && Select
  const styleName = (id: string) => (id === 'auto' ? 'Auto' : (DESIGNS.find(d => d.id === id)?.name ?? id))

  return (
    <Box flexDirection="column">
      <Text color={SAND} bold>LOOK</Text>
      {picker ? (
        <Box flexDirection="column">
          <Select
            key="style"
            label="Band design"
            value={p.style}
            options={STYLE_CHOICES.map(id => ({ value: id, label: styleName(id) }))}
            onSelect={(value: string) => set({ style: value })}
          />
          <Select
            key="outfit"
            label="Clawd outfit"
            value={p.outfit}
            options={OUTFIT_CHOICES.map(id => ({ value: id, label: id }))}
            onSelect={(value: string) => set({ outfit: value })}
          />
        </Box>
      ) : (
        <Box>
          <Button key="style" label={`Design: ${styleName(p.style)}`} onPress={() => set({ style: next(STYLE_CHOICES, p.style) })} />
          <Button key="outfit" label={` Outfit: ${p.outfit}`} onPress={() => set({ outfit: next(OUTFIT_CHOICES, p.outfit) })} />
        </Box>
      )}
      <Box>
        <Button key="status" label={`Band: ${p.status ? 'on' : 'off'}`} onPress={() => set({ status: !p.status })} />
        <Button key="mascot" label={` Mascot: ${p.mascot ? 'on' : 'off'}`} onPress={() => set({ mascot: !p.mascot })} />
        <Button key="pane" label={` Pane on start: ${p.pane ? 'on' : 'off'}`} onPress={() => set({ pane: !p.pane })} />
        <Button key="goal" label={` Goal: ${fmt(p.goal)}`} onPress={() => set({ goal: next(GOALS, GOALS.includes(p.goal) ? p.goal : GOALS[0]) })} />
      </Box>
      <Box flexWrap="wrap">
        {SECTIONS.map(s => (
          <Button
            key={`sec-${s.id}`}
            label={`${s.label}: ${p.sections[s.id] !== false ? 'on' : 'off'} `}
            onPress={() => set({ sections: { ...p.sections, [s.id]: p.sections[s.id] === false } })}
          />
        ))}
      </Box>
    </Box>
  )
}

export const renderPane = (c: PaneCtx) => {
  const { Box, Text } = c.kit.ui
  const on = SECTIONS.filter(s => c.p.sections[s.id] !== false)

  return (
    <Box flexDirection="column" paddingX={1}>
      {on.map(s => (
        <Box key={s.id} flexDirection="column" marginBottom={1}>
          {sections[s.id](c)}
        </Box>
      ))}
      {look(c)}
    </Box>
  )
}

