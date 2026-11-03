import { expect, test } from 'claude-code/testing'

import { IDLE_MS, pileOf, stageCells, stageSvg } from './stage'

// 2 pm (daytime), and the start of the idle loop it falls in.
const NOON = new Date(2026, 10, 3, 14, 0, 0).getTime()
const NOON_LOOP = NOON - (NOON % IDLE_MS)

const view = (o: Record<string, unknown> = {}) =>
  ({
    now: NOON_LOOP + 5000,
    working: false,
    asleep: false,
    today: { all: 0, code: 0, comments: 0, blank: 0 },
    goal: 500,
    flash: 0,
    flashAt: 0,
    mile: false,
    mileAt: 0,
    ...o,
  }) as any

const code = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })

test('one block per 25 lines of a 500-line goal; past the goal they turn gold', () => {
  expect(pileOf(0, 500)).toBe(0)
  expect(pileOf(312, 500)).toBe(12)
  expect(pileOf(600, 500)).toBe(24)
  const met = stageSvg(view({ today: code(600) }), 400)
  expect((met.match(/class="go"/g) ?? []).length).toBe(4)
})

test('working runs the code belt; idle brings the bug and mini Clawd; night puts out the moon', () => {
  const work = stageSvg(view({ working: true }), 400)
  expect(work).toMatch(/clip-path="url\(#belt\)"/)
  expect(work).not.toMatch(/'!'|>!</)
  const idle = stageSvg(view(), 400)
  expect(idle).toMatch(/>!</) // mini Clawd catches the bug
  expect(idle).toMatch(/>z</) // and naps later in the loop
  const night = stageSvg(view({ now: new Date(2026, 10, 3, 23, 0, 0).getTime() }), 400)
  expect(night).toMatch(/<path d="M/)
  expect(night).not.toMatch(/>!</)
})

test('a write drops the new blocks in and zips the +N chip; a milestone sets off fireworks', () => {
  const now = NOON_LOOP + 5000
  const s = stageSvg(view({ now, today: code(100), flash: 50, flashAt: now - 100 }), 400)
  expect((s.match(/attributeName="y" from="-10"/g) ?? []).length).toBe(2) // 50..100 lines = blocks 2 and 3
  expect(s).toMatch(/>\+50</)
  const m = stageSvg(view({ now, mile: true, mileAt: now - 200 }), 400)
  expect((m.match(/opacity="0"><animate attributeName="opacity" values="1;0"/g) ?? []).length).toBe(42)
})

test('the terminal stage is one row: symbols while working, a bug when idle, the pile at the right', () => {
  const live = { working: false, asleep: false, night: false, blocks: 9, mileUntil: 0 }
  expect(stageCells({ ...live, working: true }, NOON, 30)).not.toBe(stageCells(live, NOON_LOOP + 8000, 30))
  expect(stageCells(live, NOON_LOOP + 8000, 30)).not.toBe(stageCells(live, NOON_LOOP + 9000, 30)) // the bug walks
})
