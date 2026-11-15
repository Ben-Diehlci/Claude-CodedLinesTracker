// A: a hairline rounded card, big numbers, Clawd's stage (things happen while you work), session dots.
import { fmt } from '../model'
import type { View } from '../model'
import { confetti, dots, est, rect, text } from '../draw'
import { CLAY, FLASH, MACHINE_CLS, SAND, bandWidth, bandWithStage, clawdAt, clawdHeight, clawdWidth, machinesTerm, mileLabel, stageAt } from './common'
import type { Design } from './common'

const PX = 4
const H = 74
const STAGE_Y = 33
/** Cells the terminal stage gets. */
const STAGE_COLS = 30

const rowsOf = (v: View) => (v.rows.length ? v.rows : [{ active: true, hot: false }])

export const card: Design = {
  id: 'card',
  name: 'Card',
  desktop: (v, k) => {
    const w = bandWidth(v)
    const tx = v.mascot ? 12 + clawdWidth(PX) + 10 : 16
    // Today's lines up top (every session); this session's go in the side column.
    const code = fmt(v.today.code)
    const all = fmt(v.today.all)
    let inner = `<rect x="1" y="1" width="${w - 2}" height="${H - 2}" rx="12" fill="none" class="${v.mile ? 'cs' : 'hs'}" stroke-width="${v.mile ? 2 : 1}"/>`
    if (v.mascot) inner += clawdAt(v, 12, (H - clawdHeight(v, PX)) / 2, PX)
    if (v.mascot && v.mile) inner += confetti(12 + clawdWidth(PX) / 2, H / 2, v.mileAt)

    inner += text(tx, 25, code, { cls: 'cl', size: 18, bold: true })
    let x = tx + est(code, 18, true) + 5
    inner += text(x, 25, 'code lines today', { cls: 'mu', size: 12 })
    x += est('code lines today', 12) + 14
    inner += text(x, 25, all, { cls: 'sa', size: 15, bold: true })
    x += est(all, 15, true) + 5
    inner += text(x, 25, 'lines with comments', { cls: 'mu', size: 12 })
    x += est('lines with comments', 12) + 12
    const chip = v.mile ? `✦ ${mileLabel(v)}` : v.flash > 0 ? `+${fmt(v.flash)}` : ''
    if (chip) {
      const pw = est(chip, 12, true) + 16
      inner += rect(x, 9, pw, 20, 'fl', 10, 'fill-opacity=".18"') + text(x + pw / 2, 23, chip, { cls: 'fl', size: 12, bold: true, anchor: 'middle' })
    }

    const side = w - tx > 420
    const sw = Math.max(160, Math.min(900, w - tx - (side ? 170 : 14)))
    if (side) {
      const rows = rowsOf(v)
      // The session dots step aside while the "+N" chip would run into them (it shows only a few seconds).
      const dotsX = w - 16 - rows.length * 11 + 7
      if (!chip || x + est(chip, 12, true) + 16 < dotsX - 10) inner += dots(dotsX, 17, rows)
      if (v.machines.length > 1) {
        // One colored line per computer: its name and lines today, then its all-time number in muted text.
        // Up to three computers (two Macs and Cloud); the lines draw closer and smaller with three.
        const ms = v.machines.slice(0, 3)
        const step = ms.length > 2 ? 11.5 : 16
        const size = ms.length > 2 ? 11 : 12
        const nameOf = (m: (typeof ms)[number]) => `${m.name.length > 14 ? m.name.slice(0, 13) + '…' : m.name} ${fmt(m.today)}`
        // On a narrow band the all-time part is left out when the column would crowd the numbers on top.
        const topEnd = x + (chip ? est(chip, 12, true) + 16 : 0)
        const colW = Math.max(...ms.map(m => est(nameOf(m), size, true) + est(` · ${fmt(m.life)}`, size)))
        const withLife = topEnd + 12 < w - 16 - colW
        ms.forEach((m, i) => {
          const y = 35 + i * step
          const life = withLife ? ` · ${fmt(m.life)}` : ''
          if (life) inner += text(w - 16, y, life, { cls: 'mu', size, anchor: 'end' })
          inner += text(w - 16 - (life ? est(life, size) : 0), y, nameOf(m), { cls: MACHINE_CLS[m.slot % 4], size, anchor: 'end', bold: true })
        })
        inner += text(w - 16, 69, `${fmt(v.life.code)} all time${v.countBoth ? ', combined' : ', this computer'}`, { cls: 'mu', size: 11, anchor: 'end' })
      } else {
        inner += text(w - 16, 35, `${v.sessions} ${v.sessions === 1 ? 'session' : 'sessions'}`, { cls: 'mu', size: 12, anchor: 'end' })
        inner += text(w - 16, 51, `${fmt(v.session.code)} this session`, { cls: 'mu', size: 12, anchor: 'end' })
        inner += text(w - 16, 66, `${fmt(v.life.code)} all time`, { cls: 'mu', size: 12, anchor: 'end' })
      }
    }

    return bandWithStage(k, v, w, H, inner, stageAt(v, tx, STAGE_Y, sw))
  },
  terminal: (v, k) => {
    const { Box, Text } = k.ui
    const rows = rowsOf(v)
    const stage = k.stage(STAGE_COLS)
    const stats = (
      <Box flexDirection="column">
        <Text>
          <Text color={CLAY} bold>{'LINES '}</Text>
          <Text color={CLAY} bold>{fmt(v.today.code)}</Text>
          <Text dimColor> code lines today  </Text>
          <Text color={SAND} bold>{fmt(v.today.all)}</Text>
          <Text dimColor> lines with comments</Text>
          {v.mile ? (
            <Text color={FLASH} bold>{`  ✦ ${mileLabel(v)}`}</Text>
          ) : v.flash > 0 ? (
            <Text color={FLASH} bold>{`  +${fmt(v.flash)}`}</Text>
          ) : (
            <Text> </Text>
          )}
        </Text>
        <Box>
          {stage}
          <Text>
            {v.machines.length > 1 ? (
              <Text>{machinesTerm(v, Text)}{'  '}</Text>
            ) : (
              <Text>
                <Text bold>{` ${fmt(v.session.code)}`}</Text>
                <Text dimColor>{' this session  '}</Text>
                {rows.map(r => (
                  <Text color={r.active ? CLAY : undefined} dimColor={!r.active}>{r.hot ? '◉' : '●'}</Text>
                ))}
                <Text dimColor>{` ${v.sessions} ${v.sessions === 1 ? 'session' : 'sessions'}  `}</Text>
              </Text>
            )}
            <Text bold>{fmt(v.life.code)}</Text>
            <Text dimColor> all time</Text>
          </Text>
        </Box>
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
