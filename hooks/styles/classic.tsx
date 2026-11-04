// The band as it was before the designs: Clawd, then two text lines. On the desktop it is one Svg, with
// Clawd's stage filling the room to the right of the text.
import { fmt } from '../model'
import type { View } from '../model'
import { confetti, est, text } from '../draw'
import { STAGE_H } from '../stage'
import { CLAY, FLASH, SAND, bandSvg, bandWidth, bandWithStage, clawdAt, clawdHeight, clawdWidth, mileLabel, stageAt } from './common'
import type { Design, Kit } from './common'

const PX = 4
const H = 44
/** Below this much room the stage is left out. */
const STAGE_MIN = 140

/** One line of text runs: [text, class, bold]. Returns the markup and where the line ends. */
const line = (x: number, y: number, runs: [string, string, boolean][]): { o: string; end: number } => {
  let o = ''
  for (const [s, cls, bold] of runs) {
    // An Svg text drops its leading and trailing spaces, so they become gaps instead.
    const lead = s.length - s.trimStart().length
    o += text(x + lead * 4, y, s.trim(), { cls, size: 13, bold })
    x += est(s.trim(), 13, bold) + (s.length - s.trim().length) * 4
  }

  return { o, end: x }
}

const body = (v: View, k: Kit, mascotEl: any) => {
  const { Box, Text } = k.ui
  const multi = v.sessions > 1
  const stats = (
    <Box flexDirection="column">
      <Text>
        <Text color={CLAY} bold>{'LINES '}</Text>
        <Text color={CLAY} bold>{fmt(v.session.code)}</Text>
        <Text dimColor> code lines  </Text>
        <Text color={SAND} bold>{fmt(v.session.all)}</Text>
        <Text dimColor> lines with comments</Text>
        {v.mile ? (
          <Text color={FLASH} bold>{`  ✦ ${mileLabel(v)}`}</Text>
        ) : v.flash > 0 ? (
          <Text color={FLASH} bold>{`  +${fmt(v.flash)}`}</Text>
        ) : (
          <Text> </Text>
        )}
      </Text>
      <Text>
        <Text dimColor>{multi ? 'all sessions today ' : 'today '}</Text>
        <Text bold>{fmt(v.today.code)}</Text>
        <Text dimColor>  all time </Text>
        <Text bold>{fmt(v.life.code)}</Text>
        {multi ? <Text dimColor>{`  ${v.sessions} sessions active`}</Text> : <Text> </Text>}
      </Text>
    </Box>
  )
  if (!mascotEl) return <Box paddingX={1}>{stats}</Box>

  return (
    <Box paddingX={1} alignItems="center">
      {mascotEl}
      <Box marginLeft={1}>{stats}</Box>
    </Box>
  )
}

export const classic: Design = {
  id: 'classic',
  name: 'Classic',
  terminal: (v, k) => body(v, k, v.mascot ? k.raster() : null),
  desktop: (v, k) => {
    const w = bandWidth(v)
    const multi = v.sessions > 1
    let inner = ''
    let x = 8
    if (v.mascot) {
      inner += clawdAt(v, x, (H - clawdHeight(v, PX)) / 2, PX)
      if (v.mile) inner += confetti(x + clawdWidth(PX) / 2, H / 2, v.mileAt)
      x += clawdWidth(PX) + 10
    }
    const chip = v.mile ? `  ✦ ${mileLabel(v)}` : v.flash > 0 ? `  +${fmt(v.flash)}` : ''
    const a = line(x, 18, [
      ['LINES ', 'cl', true],
      [fmt(v.session.code), 'cl', true],
      [' code lines  ', 'mu', false],
      [fmt(v.session.all), 'sa', true],
      [' lines with comments', 'mu', false],
      ...(chip ? ([[chip, 'fl', true]] as [string, string, boolean][]) : []),
    ])
    const b = line(x, 36, [
      [multi ? 'all sessions today ' : 'today ', 'mu', false],
      [fmt(v.today.code), 'fg', true],
      ['  all time ', 'mu', false],
      [fmt(v.life.code), 'fg', true],
      ...(multi ? ([[`  ${v.sessions} sessions active`, 'mu', false]] as [string, string, boolean][]) : []),
    ])
    inner += a.o + b.o
    const sx = Math.max(a.end, b.end) + 16
    const room = Math.min(900, w - 8 - sx)
    if (room < STAGE_MIN) return bandSvg(k, v, w, H, inner)

    return bandWithStage(k, v, w, H, inner, stageAt(v, sx, (H - STAGE_H) / 2, room))
  },
}
