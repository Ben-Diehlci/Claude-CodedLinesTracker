import { expect, test } from 'claude-code/testing'

import { canvasH, clawdBody, grid, LOOP_MS, mark, OUTFITS, TRICKS } from './clawd'
import { badgesOf, bestDay, heat, langRows, levelOf, mergePrefs, modelName, pickOutfit, streaks } from './model'

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

test('auto outfit: a new one each day (never the same two days running), some plain days, the nightcap after 10 pm', () => {
  const days = Array.from({ length: 60 }, (_, i) => pickOutfit('auto', new Date(2026, 10, 3 + i, 12).getTime()))
  days.slice(1).forEach((o, i) => expect(o).not.toBe(days[i]))
  expect(new Set(days).size).toBeGreaterThan(15)
  const plain = days.filter(o => o === 'none').length
  expect(plain).toBeGreaterThan(5)
  expect(plain).toBeLessThan(25)
  expect(days).not.toContain('night')
  // The same all day.
  expect(pickOutfit('auto', new Date(2026, 10, 3, 8).getTime())).toBe(pickOutfit('auto', new Date(2026, 10, 3, 21).getTime()))
  expect(pickOutfit('auto', new Date(2026, 10, 3, 23).getTime())).toBe('night')
  expect(pickOutfit('shades', new Date(2026, 10, 3, 23).getTime())).toBe('shades')
  expect(pickOutfit('nonsense', NOON)).toBe('none')
})

test('every outfit draws: hats above, face and body pieces over him', () => {
  for (const o of OUTFITS) {
    const g = grid({}, o)
    expect(g.length).toBe(canvasH(o))
    expect(g.every(r => r.length === 14)).toBe(true)
  }
  expect(grid({}, 'mustache').some(r => r.join('').includes('OKKKKO'))).toBe(true)
  expect(OUTFITS.length).toBeGreaterThan(19)
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

test('new tricks: spin turns Clawd around, peek ducks him below the edge, sneeze shows a puff', () => {
  const left = grid({}).map(r => r.join(''))
  const spun = grid({ flip: true }).map(r => r.join(''))
  expect(spun).toEqual(left.map(r => [...r].reverse().join('')))
  const ducked = grid({ duck: 4 })
  expect(ducked.slice(0, 5).every(r => r.every(c => c === '.'))).toBe(true)
  expect(mark({ sneeze: true })?.ch).toBe('*')
  for (const t of ['spin', 'peek', 'sneeze']) expect(Object.keys(TRICKS)).toContain(t)
})

test('languages: one color per type on every row, the sixth type on is "other", untracked lines "earlier"', () => {
  const { named, rows } = langRows({
    byExt: [['ts', 40], ['md', 5]],
    langToday: [['ts', 300], ['py', 100]],
    langLife: [['py', 900], ['ts', 800], ['go', 50], ['rs', 40], ['sh', 30], ['md', 20], ['css', 10]],
    langEarlierToday: 0,
    langEarlierLife: 1000,
  })
  expect(named).toEqual(['py', 'ts', 'go', 'rs', 'sh'])
  expect(rows.map(r => r.label)).toEqual(['This chat', 'Today', 'All time'])
  expect(rows[0]!.parts).toEqual([{ key: 'ts', n: 40, slot: 1 }, { key: 'other', n: 5, slot: -1 }])
  expect(rows[2]!.parts.slice(-2)).toEqual([{ key: 'other', n: 30, slot: -1 }, { key: 'earlier', n: 1000, slot: -2 }])
  expect(rows[2]!.total).toBe(2850)
})
