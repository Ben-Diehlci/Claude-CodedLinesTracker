import { expect, test } from 'claude-code/testing'

import { clawdBody, LOOP_MS } from './clawd'
import { badgesOf, bestDay, heat, levelOf, mergePrefs, modelName, pickOutfit, streaks } from './model'

const c = (n: number) => ({ all: n, code: n, comments: 0, blank: 0 })
const NOON = new Date(2026, 10, 3, 12).getTime()
const day = (back: number) => {
  const d = new Date(NOON - back * 86_400_000)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('level is one per 2,500 lifetime lines', () => {
  expect(levelOf(0)).toMatchObject({ level: 1, toNext: 2500, next: 2500 })
  expect(levelOf(18_930)).toMatchObject({ level: 8, toNext: 1070, next: 20_000 })
})

test('outfit by level, fixed choice, and nightcap after 10 pm', () => {
  const night = new Date(2026, 10, 3, 23).getTime()
  expect(pickOutfit('auto', 2, NOON)).toBe('none')
  expect(pickOutfit('auto', 3, NOON)).toBe('party')
  expect(pickOutfit('auto', 5, NOON)).toBe('shades')
  expect(pickOutfit('auto', 7, NOON)).toBe('crown')
  expect(pickOutfit('auto', 7, night)).toBe('night')
  expect(pickOutfit('shades', 1, night)).toBe('shades')
})

test('streak counts back from today, or from yesterday while today is empty', () => {
  const days = { [day(0)]: c(5), [day(1)]: c(5), [day(2)]: c(5), [day(4)]: c(9), [day(5)]: c(9) }
  expect(streaks(days, NOON)).toEqual({ streak: 3, best: 3 })
  expect(streaks({ [day(1)]: c(5), [day(2)]: c(5) }, NOON).streak).toBe(2)
  expect(streaks({}, NOON)).toEqual({ streak: 0, best: 0 })
  expect(bestDay({ a: c(3), b: c(9) })).toEqual({ day: 'b', code: 9 })
})

test('badges come from the data', () => {
  const t: any = { life: { all: 0, code: 10_500, comments: 20, blank: 0 }, owl: true, exts: 2 }
  const got = Object.fromEntries(badgesOf(t, 5).map(b => [b.id, b.got]))
  expect(got).toEqual({ first: true, streak: true, owl: true, club: true, comment: false, poly: false })
})

test('heat levels and prefs-1 values surviving the merge', () => {
  expect([0, 1, 50, 100].map(v => heat(v, 100))).toEqual([0, 1, 2, 4])
  const merged = mergePrefs({ status: false, pane: true, mascot: false } as any)
  expect(merged).toMatchObject({ status: false, mascot: false, style: 'auto', outfit: 'auto' })
  expect(merged.sections.numbers).toBe(false)
  expect(Object.entries(merged.sections).filter(([k]) => k !== 'numbers').every(([, on]) => on)).toBe(true)
})

test('Clawd keeps his place in the 90 s loop across redraws', () => {
  const o = { working: false, asleep: false, hop: false }
  const at = Math.floor(1_700_000_000_000 / LOOP_MS) * LOOP_MS + 10_000
  const strip = (s: string) => s.replace(/ begin="[^"]*"/g, '')
  // Inside one window the timeline is the same; only the start point moves on.
  const a = clawdBody(4, { ...o, now: at })
  const b = clawdBody(4, { ...o, now: at + 20_000 })
  expect(strip(a)).toBe(strip(b))
  expect(b).toMatch(new RegExp(`begin="-${(((at + 20_000) % LOOP_MS) / 1000).toFixed(2)}s"`))
  // Six tricks per window: some poses beyond plain blinking are in it.
  expect(a.split('<g visibility').length - 1).toBeGreaterThan(4)
  // A hop plays from the start.
  expect(clawdBody(4, { ...o, hop: true, now: at })).not.toMatch(/begin=/)
})

test('model ids read as short names', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-4-20250514')).toBe('Sonnet 4')
  expect(modelName('claude-3-5-haiku-20241022')).toBe('Haiku')
  expect(modelName('sonnet')).toBe('Sonnet')
  expect(modelName('claude-fable-5-1[1m]')).toBe('Fable 5.1')
  expect(modelName('')).toBe('Unknown')
})
