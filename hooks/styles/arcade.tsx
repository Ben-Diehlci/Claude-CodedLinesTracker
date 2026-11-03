// B: an arcade scoreboard - pixel-font numbers, hi-score day, level with XP segments, streak flame.
import { fmt } from '../model'
import { confetti, est, flame, goalBar, pix, pixWidth, rect, segments, text } from '../draw'
import { CLAY, FLASH, GOLD, SAND, bandSvg, bandWidth, clawdAt, clawdHeight, clawdWidth, mileLabel } from './common'
import type { Design } from './common'

const PX = 4
const H = 68
const P = 3

export const arcade: Design = {
  id: 'arcade',
  name: 'Arcade',
  desktop: (v, k) => {
    const w = bandWidth(v)
    let x = v.mascot ? 12 + clawdWidth(PX) + 12 : 16
    let inner = rect(0, 0, w, H, 'ins', 10)
    if (v.mile) inner += `<rect x="1" y="1" width="${w - 2}" height="${H - 2}" rx="10" fill="none" class="cs" stroke-width="2"/>`
    if (v.mascot) inner += clawdAt(v, 12, (H - clawdHeight(v, PX)) / 2, PX)
    if (v.mascot && v.mile) inner += confetti(12 + clawdWidth(PX) / 2, H / 2, v.mileAt)

    const tag = (bx: number, s: string) => text(bx, 20, s, { cls: 'mu', size: 10, bold: true, spacing: 1.2 })
    const hi = v.best && v.best.code > 0 ? Math.max(v.best.code, v.today.code) : v.today.code
    const beating = v.today.code > 0 && v.today.code >= hi
    const blocks: { width: number; draw: (bx: number) => string }[] = []
    const number = (label: string, value: string, cls: string) => ({
      width: Math.max(est(label, 10, true) + label.length * 1.2, pixWidth(value, P)) + 22,
      draw: (bx: number) => tag(bx, label) + pix(bx, 30, value, P, cls),
    })
    blocks.push(number('SESSION LINES', fmt(v.session.code), 'cl'))
    blocks.push(number('LINES TODAY', fmt(v.today.code), 'sa'))
    blocks.push(number('HI-SCORE DAY', fmt(hi), beating ? 'fl' : 'go'))
    const lv = `LV ${v.level} - NEXT AT ${fmt(v.nextAt)}`
    blocks.push({
      width: Math.max(est(lv, 10, true) + lv.length * 1.2, 12 * 11) + 22,
      draw: bx => tag(bx, lv) + segments(bx, 32, Math.round(v.xp * 12), 12),
    })
    blocks.push({
      width: 100,
      draw: bx => tag(bx, 'STREAK') + flame(bx, 28) + text(bx + 22, 44, String(v.streak), { cls: 'fg', size: 16, bold: true }) + text(bx + 22 + est(String(v.streak), 16, true) + 4, 44, v.streak === 1 ? 'day' : 'days', { cls: 'mu', size: 12 }),
    })
    for (const b of blocks) {
      if (x + b.width > w - 8) break
      inner += b.draw(x)
      x += b.width
    }
    if (v.mile) inner += text(w - 14, 58, `✦ ${mileLabel(v)}`, { cls: 'fl', size: 12, bold: true, anchor: 'end' })
    else if (v.flash > 0) inner += text(w - 14, 58, `+${fmt(v.flash)}`, { cls: 'fl', size: 12, bold: true, anchor: 'end' })

    return bandSvg(k, v, w, H, inner)
  },
  terminal: (v, k) => {
    const { Box, Text } = k.ui
    const hi = Math.max(v.best?.code ?? 0, v.today.code)
    const stats = (
      <Box flexDirection="column">
        <Text>
          <Text dimColor>SESSION LINES </Text>
          <Text color={CLAY} bold>{fmt(v.session.code)}</Text>
          <Text dimColor>{'  LINES TODAY '}</Text>
          <Text color={SAND} bold>{fmt(v.today.code)}</Text>
          <Text dimColor>{'  HI-SCORE DAY '}</Text>
          <Text color={GOLD} bold>{fmt(hi)}</Text>
          {v.mile ? (
            <Text color={FLASH} bold>{`  ✦ ${mileLabel(v)}`}</Text>
          ) : v.flash > 0 ? (
            <Text color={FLASH} bold>{`  +${fmt(v.flash)}`}</Text>
          ) : (
            <Text> </Text>
          )}
        </Text>
        <Text>
          <Text bold>{`LV ${v.level} `}</Text>
          <Text color={CLAY}>{goalBar(v.xp, 12)}</Text>
          <Text dimColor>{` ${fmt(v.toNext)} to LV ${v.level + 1}   `}</Text>
          <Text color={GOLD}>▲ </Text>
          <Text bold>{v.streak}</Text>
          <Text dimColor>{v.streak === 1 ? ' day streak' : ' day streak'}</Text>
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
