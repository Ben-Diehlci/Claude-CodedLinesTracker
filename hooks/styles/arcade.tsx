// B: an arcade scoreboard - pixel-font numbers, hi-score day, level with XP segments, streak flame, and
// Clawd's stage on a little arcade screen in the room that is left.
import { fmt } from '../model'
import { confetti, est, flame, goalBar, pix, pixWidth, rect, segments, text } from '../draw'
import { CLAY, FLASH, GOLD, SAND, bandSvg, bandWidth, bandWithStage, clawdAt, clawdHeight, clawdWidth, machineLabel, machinesTerm, mileLabel, stageAt, MACHINE_CLS } from './common'
import type { Design } from './common'

const PX = 4
const H = 68
const P = 3
/** The screen needs at least this much room; less, and the blocks spread out instead. */
const SCREEN_MIN = 160
const SCREEN_Y = 27

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
    if (v.machines.length > 1) {
      // One colored line per Mac under the tag.
      blocks.push({
        width: Math.max(est('TODAY BY MAC', 10, true) + 15, ...v.machines.map(m => est(`● ${machineLabel(m)}`, 12, true))) + 22,
        draw: bx =>
          tag(bx, 'TODAY BY MAC') +
          v.machines.slice(0, 2).map((m, i) => text(bx, 35 + i * 15, `● ${machineLabel(m)}`, { cls: MACHINE_CLS[m.slot % 4], size: 12, bold: true })).join(''),
      })
    }
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
    const shown: typeof blocks = []
    let used = x
    for (const b of blocks) {
      if (used + b.width > w - 8) break
      shown.push(b)
      used += b.width
    }
    const room = w - 8 - used
    const screen = room >= SCREEN_MIN
    // No screen: share the spare room out between the blocks so they fill the band.
    const gap = screen || shown.length < 2 ? 0 : room / (shown.length - 1)
    for (const b of shown) {
      inner += b.draw(x)
      x += b.width + gap
    }
    const chip = v.mile ? `✦ ${mileLabel(v)}` : v.flash > 0 ? `+${fmt(v.flash)}` : ''
    if (!screen) {
      if (chip) inner += text(w - 14, 58, chip, { cls: 'fl', size: 12, bold: true, anchor: 'end' })

      return bandSvg(k, v, w, H, inner)
    }

    // The arcade screen: "1UP" blinks over it like a waiting cabinet, the chip sits at the label's end.
    const sx = x + 4
    const sw = Math.min(900, w - 12 - sx)
    inner += `<g>${text(sx, 20, '1UP', { cls: 'cl', size: 10, bold: true, spacing: 1.2 })}<animate attributeName="opacity" values="1;1;.2;.2" keyTimes="0;.5;.5;1" dur="1.2s" repeatCount="indefinite"/></g>`
    inner += tag(sx + 34, v.working ? 'NOW PLAYING' : 'INSERT COIN')
    if (chip) inner += text(sx + sw, 20, chip, { cls: 'fl', size: 12, bold: true, anchor: 'end' })

    return bandWithStage(k, v, w, H, inner, stageAt(v, sx, SCREEN_Y, sw))
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
          {v.machines.length > 1 ? <Text>{'  '}{machinesTerm(v, Text)}</Text> : null}
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
