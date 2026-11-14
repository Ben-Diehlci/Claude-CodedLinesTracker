import { expect, test } from 'claude-code/testing'
import type { Totals } from '../types'
import { EMPTY, dayKey } from './model'
import { expandDir, mergePeers, parsePeer, toPeerFile } from './peers'

const NOW = Date.parse('2026-11-04T15:00:00')
const c = (code: number) => ({ ...EMPTY, all: code, code })
const totals = (today: number, life: number): Totals => ({
  life: c(life),
  today: c(today),
  days: { [dayKey(NOW)]: c(today) },
  hours: Array(24).fill(0).map((_, i) => (i === 15 ? today : 0)),
  sessions: 1,
  list: [],
  owl: false,
  exts: 0,
  modelsToday: { 'Opus 5.5': today },
  modelsLife: { 'Opus 5.5': life },
  extsToday: { ts: today },
  extsLife: { ts: life },
  machines: [],
})

test('two Macs add up, and each keeps its own line', () => {
  const peer = toPeerFile('studio', 'Mac Studio', NOW - 60_000, totals(860, 30000))
  const t = mergePeers(totals(1044, 18000), 'laptop', 'MacBook Pro', [peer], NOW, 'both')
  expect(t.today.code).toBe(1904)
  expect(t.life.code).toBe(48000)
  expect(t.hours[15]).toBe(1904)
  expect(t.modelsToday['Opus 5.5']).toBe(1904)
  expect(t.extsToday.ts).toBe(1904)
  expect(t.extsLife.ts).toBe(48000)
  expect(t.machines.map(m => [m.name, m.today, m.mine])).toEqual([['MacBook Pro', 1044, true], ['Mac Studio', 860, false]])
  expect(t.machines[0].slot).not.toBe(t.machines[1].slot)
})

test('count "this" keeps this Mac only but still lists the others', () => {
  const peer = toPeerFile('studio', 'Mac Studio', NOW, totals(860, 30000))
  const t = mergePeers(totals(1044, 18000), 'laptop', 'MacBook Pro', [peer], NOW, 'this')
  expect(t.today.code).toBe(1044)
  expect(t.machines).toHaveLength(2)
})

test("a peer's yesterday does not count as today; its own file is skipped; two of one model get a number", () => {
  const old = toPeerFile('studio', 'Mac Studio', NOW - 86_400_000, totals(500, 100))
  const t = mergePeers(totals(10, 20), 'laptop', 'Mac Studio', [old, toPeerFile('laptop', 'Mac Studio', NOW, totals(10, 20))], NOW, 'both')
  expect(t.today.code).toBe(10)
  expect(t.life.code).toBe(120)
  expect(t.machines.map(m => m.name)).toEqual(['Mac Studio', 'Mac Studio 2'])
})

test('no peers: nothing changes; broken files are ignored', () => {
  expect(mergePeers(totals(5, 5), 'a', 'A', [], NOW, 'both').machines).toEqual([])
  expect(parsePeer('{"v":1')).toBeUndefined()
  expect(parsePeer('{"x":1}')).toBeUndefined()
})

test('the sync folder: ~ is spelled out, quotes and a trailing slash are dropped', () => {
  expect(expandDir('~/My Files/sync/', '/Users/me')).toBe('/Users/me/My Files/sync')
  expect(expandDir('"/Volumes/Share/lines"', '/Users/me')).toBe('/Volumes/Share/lines')
})
