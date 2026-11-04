// C: one line - today's lines, a 24-hour mini chart and, with room left, a small Clawd's stage.
// Picked by "auto" when the band is narrow.
import { fmt } from '../model'
import { confetti, est, hoursChart, hoursText, text, rect } from '../draw'
import { CLAY, FLASH, SAND, bandSvg, bandWidth, bandWithStage, clawdAt, clawdHeight, clawdWidth, machinesSvg, machinesTerm, mileLabel, stageAt, stageHeight } from './common'
import type { Design } from './common'

const PX = 2
const H = 30
/** The stage shrunk to fit the one-line band. */
const SCALE = 0.7
/** Below this much room (in band pixels) the stage is left out. */
const STAGE_MIN = 110

export const compact: Design = {
  id: 'compact',
  name: 'Compact',
  desktop: (v, k) => {
    const w = bandWidth(v)
    let inner = rect(0, 3, 3, H - 6, v.mile ? 'go' : 'cf')
    let x = 12
    if (v.mascot) {
      inner += clawdAt(v, x, (H - clawdHeight(v, PX)) / 2, PX)
      if (v.mile) inner += confetti(x + clawdWidth(PX) / 2, H / 2, v.mileAt)
      x += clawdWidth(PX) + 8
    }
    const code = fmt(v.session.code)
    inner += text(x, 19, code, { cls: 'cl', size: 14, bold: true })
    x += est(code, 14, true) + 4
    inner += text(x, 19, 'code lines', { cls: 'mu', size: 12 })
    x += est('code lines', 12) + 14
    const g = `${fmt(v.today.code)} today`
    inner += text(x, 19, g, { cls: 'mu', size: 12 })
    x += est(g, 12) + 14
    if (v.machines.length > 1) {
      const ms = machinesSvg(v, x, 19)
      if (ms.end < w - 8 - 60) {
        inner += ms.o
        x = ms.end + 14
      }
    }
    if (x + 24 * 5 < w - 8) {
      inner += hoursChart(x, 6, v.hours, 4, 16, new Date(v.now).getHours())
      x += 24 * 5 + 6
      if (x + 90 < w - 8) {
        inner += text(x, 19, 'today by hour', { cls: 'mu', size: 12 })
        x += est('today by hour', 12) + 12
      }
    }
    const chip = v.mile ? `✦ ${mileLabel(v)}` : v.flash > 0 ? `+${fmt(v.flash)}` : ''
    if (chip && x + 40 < w) {
      const pw = est(chip, 12, true) + 14
      inner += rect(x, 5, pw, 20, 'fl', 10, 'fill-opacity=".18"') + text(x + pw / 2, 19, chip, { cls: 'fl', size: 12, bold: true, anchor: 'middle' })
      x += pw + 10
    }
    // The room left goes to Clawd's stage, shrunk to the band's height.
    const room = Math.min(900, w - 8 - x)
    if (room < STAGE_MIN) return bandSvg(k, v, w, H, inner)

    return bandWithStage(k, v, w, H, inner, stageAt(v, x, (H - stageHeight(SCALE)) / 2, room / SCALE, SCALE))
  },
  terminal: (v, k) => {
    const { Box, Text } = k.ui

    return (
      <Box paddingX={1}>
        <Text>
          <Text dimColor>{v.mascot ? `${k.face} ` : ''}</Text>
          <Text color={CLAY} bold>{'LINES '}</Text>
          <Text color={CLAY} bold>{fmt(v.session.code)}</Text>
          <Text dimColor> code lines  </Text>
          <Text bold>{fmt(v.today.code)}</Text>
          <Text dimColor>{' today  '}</Text>
          <Text color={SAND}>{hoursText(v.hours)}</Text>
          {v.machines.length > 1 ? <Text>{machinesTerm(v, Text)}</Text> : null}
          {v.mile ? <Text color={FLASH} bold>{`  ✦ ${mileLabel(v)}`}</Text> : v.flash > 0 ? <Text color={FLASH} bold>{`  +${fmt(v.flash)}`}</Text> : <Text> </Text>}
        </Text>
      </Box>
    )
  },
}
