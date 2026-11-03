// The band as it was before the designs: Clawd, then two text lines.
import { fmt } from '../model'
import type { View } from '../model'
import { CLAY, FLASH, SAND, mileLabel } from './common'
import type { Design, Kit } from './common'

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
    const { Svg } = k.ui
    const mascot = v.mascot ? (
      <Svg
        key="clawd"
        alt="Clawd the pixel crab"
        isInteractive
        width={56}
        height={v.outfit === 'none' || v.outfit === 'shades' ? 32 : 40}
        source={k.clawdSvg(4)}
      />
    ) : null

    return body(v, k, mascot)
  },
}
