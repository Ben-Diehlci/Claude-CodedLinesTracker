// A: a hairline rounded card, big numbers, a twinkling daily-goal bar, session dots.
import { fmt } from '../model'
import type { View } from '../model'
import { confetti, dither, dots, est, goalBar, rect, text } from '../draw'
import { CLAY, FLASH, SAND, bandSvg, bandWidth, clawdAt, clawdHeight, clawdWidth, mileLabel } from './common'
import type { Design } from './common'

const PX = 4
const H = 56

const rowsOf = (v: View) => (v.rows.length ? v.rows : [{ active: true, hot: false }])

export const card: Design = {
  id: 'card',
  name: 'Card',
  desktop: (v, k) => {
    const w = bandWidth(v)
    const tx = v.mascot ? 12 + clawdWidth(PX) + 10 : 16
    const code = fmt(v.session.code)
    const all = fmt(v.session.all)
    let inner = `<rect x="1" y="1" width="${w - 2}" height="${H - 2}" rx="12" fill="none" class="${v.mile ? 'cs' : 'hs'}" stroke-width="${v.mile ? 2 : 1}"/>`
    if (v.mascot) inner += clawdAt(v, 12, (H - clawdHeight(v, PX)) / 2, PX)
    if (v.mascot && v.mile) inner += confetti(12 + clawdWidth(PX) / 2, H / 2, v.mileAt)

    inner += text(tx, 25, code, { cls: 'cl', size: 18, bold: true })
    let x = tx + est(code, 18, true) + 5
    inner += text(x, 25, 'code lines', { cls: 'mu', size: 12 })
    x += est('code lines', 12) + 14
    inner += text(x, 25, all, { cls: 'sa', size: 15, bold: true })
    x += est(all, 15, true) + 5
    inner += text(x, 25, 'lines with comments', { cls: 'mu', size: 12 })
    x += est('lines with comments', 12) + 12
    const chip = v.mile ? `✦ ${mileLabel(v)}` : v.flash > 0 ? `+${fmt(v.flash)}` : ''
    if (chip) {
      const pw = est(chip, 12, true) + 16
      inner += rect(x, 9, pw, 20, 'fl', 10, 'fill-opacity=".18"') + text(x + pw / 2, 23, chip, { cls: 'fl', size: 12, bold: true, anchor: 'middle' })
    }

    const side = w - tx > 520
    const bw = Math.max(120, Math.min(300, w - tx - (side ? 200 : 150)))
    inner += dither(tx, 33, bw, 16, v.goalFrac, fmt(v.today.code))
    inner += text(tx + bw + 10, 46, `${fmt(v.today.code)} / ${fmt(v.goal)} lines today`, { cls: 'mu', size: 12 })
    if (side) {
      const rows = rowsOf(v)
      inner += dots(w - 16 - rows.length * 11 + 7, 15, rows)
      inner += text(w - 16, 33, `${v.sessions} ${v.sessions === 1 ? 'session' : 'sessions'}`, { cls: 'mu', size: 12, anchor: 'end' })
      inner += text(w - 16, 49, `${fmt(v.life.code)} all time`, { cls: 'mu', size: 12, anchor: 'end' })
    }

    return bandSvg(k, v, w, H, inner)
  },
  terminal: (v, k) => {
    const { Box, Text } = k.ui
    const rows = rowsOf(v)
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
          <Text color={CLAY}>{goalBar(v.goalFrac, 14)}</Text>
          <Text bold>{` ${fmt(v.today.code)}`}</Text>
          <Text dimColor>{`/${fmt(v.goal)} today  `}</Text>
          {rows.map(r => (
            <Text color={r.active ? CLAY : undefined} dimColor={!r.active}>{r.hot ? '◉' : '●'}</Text>
          ))}
          <Text dimColor>{` ${v.sessions} ${v.sessions === 1 ? 'session' : 'sessions'}  `}</Text>
          <Text bold>{fmt(v.life.code)}</Text>
          <Text dimColor> all time</Text>
        </Text>
      </Box>
    )
    const mascot = v.mascot ? k.raster() : null

    return (
      <Box paddingX={1} alignItems="center">
        {mascot}
        <Box marginLeft={mascot ? 1 : 0}>{stats}</Box>
      </Box>
    )
  },
}
