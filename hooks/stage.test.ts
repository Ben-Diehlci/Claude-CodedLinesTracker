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
    flash: 0,
    flashAt: 0,
    mile: false,
    mileAt: 0,
    ...o,
  }) as any

const code = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })

test('a block per 100 lines today, and each full 1,000 as one gold column, with a key beside the pile', () => {
  expect(pileOf(0)).toEqual({ gold: 0, blocks: 0 })
  expect(pileOf(312)).toEqual({ gold: 0, blocks: 3 })
  expect(pileOf(3130)).toEqual({ gold: 3, blocks: 1 })
  const s = stageSvg(view({ today: code(3130) }), 400)
  expect((s.match(/class="go"/g) ?? []).length).toBe(4) // three columns and the key's gold mark
  expect(s).toMatch(/>100 lines</)
  expect(s).toMatch(/>1,000 lines</)
  expect(stageSvg(view({ today: code(312) }), 400)).not.toMatch(/1,000 lines/)
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
  const s = stageSvg(view({ now, today: code(400), flash: 250, flashAt: now - 100 }), 400)
  expect((s.match(/attributeName="y" from="-9"/g) ?? []).length).toBe(3) // 150 -> 400 lines = blocks 2, 3 and 4
  expect(s).toMatch(/>\+250</)
  const m = stageSvg(view({ now, mile: true, mileAt: now - 200 }), 400)
  expect((m.match(/opacity="0"><animate attributeName="opacity" values="1;0"/g) ?? []).length).toBe(42)
})

test('the terminal stage is one row: symbols while working, a bug when idle, the pile at the right', () => {
  const live = { working: false, asleep: false, night: false, blocks: 9, mileUntil: 0 }
  expect(stageCells({ ...live, working: true }, NOON, 30)).not.toBe(stageCells(live, NOON_LOOP + 8000, 30))
  expect(stageCells(live, NOON_LOOP + 8000, 30)).not.toBe(stageCells(live, NOON_LOOP + 9000, 30)) // the bug walks
})
