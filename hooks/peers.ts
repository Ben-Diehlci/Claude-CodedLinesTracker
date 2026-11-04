// Two (or more) Macs, one count. Each Mac writes only its own totals file into a folder Syncthing shares and
// reads every other file there; nobody edits another Mac's file, so there is nothing to conflict.
import type { Counts, Machine, Totals } from '../types'
import { EMPTY, dayKey } from './model'

/** "~/Sync/lines" with the home folder spelled out; trailing slashes dropped. */
export const expandDir = (dir: string, home: string): string => {
  const d = dir.trim().replace(/^["']|["']$/g, '')

  return (d.startsWith('~/') ? `${home}${d.slice(1)}` : d).replace(/\/+$/, '')
}

export const PEER_PREFIX = 'totals-'
/** A Mac that has not written for this long shows "last seen" instead of "now". */
export const STALE_MS = 10 * 60 * 1000
/** Rewrite the file when the numbers changed (at most this often), or this often anyway so "last seen" stays fresh. */
export const WRITE_CHANGED_MS = 15_000
export const WRITE_IDLE_MS = 2 * 60 * 1000

/** What one Mac leaves in the folder: its own totals only (never the others' added in). */
export type PeerFile = {
  v: 1
  id: string
  /** Model name, "MacBook Pro". */
  name: string
  at: number
  /** The day the today fields belong to (YYYY-MM-DD). */
  d: string
  today: Counts
  life: Counts
  days: Record<string, Counts>
  hours: number[]
  modelsToday: Record<string, number>
  modelsLife: Record<string, number>
}

export const toPeerFile = (id: string, name: string, now: number, t: Totals): PeerFile => ({
  v: 1,
  id,
  name,
  at: now,
  d: dayKey(now),
  today: t.today,
  life: t.life,
  days: t.days,
  hours: t.hours,
  modelsToday: t.modelsToday,
  modelsLife: t.modelsLife,
})

/** A file that reads as a PeerFile, else undefined (half-synced or foreign files are ignored). */
export const parsePeer = (text: string): PeerFile | undefined => {
  try {
    const f = JSON.parse(text) as PeerFile
    if (f?.v !== 1 || typeof f.id !== 'string' || typeof f.name !== 'string' || !f.life || !f.today || !Array.isArray(f.hours)) return undefined

    return f
  } catch {
    return undefined
  }
}

/** Host names like "Alexs-MacBook-Pro" become safe file names. */
export const safeId = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'mac'

const addC = (a: Counts, b: Counts): Counts => ({ all: a.all + b.all, code: a.code + b.code, comments: a.comments + b.comments, blank: a.blank + b.blank })

const addMap = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a }
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n

  return out
}

/**
 * This Mac's totals plus the peers' (mode "both"), and the list of Macs either way.
 * Colors follow the sorted names, so each Mac has the same color on every screen.
 */
export const mergePeers = (own: Totals, ownId: string, ownName: string, peers: PeerFile[], now: number, mode: string): Totals => {
  const others = peers.filter(p => p.id !== ownId)
  if (others.length === 0) return { ...own, machines: [] }
  const today = dayKey(now)
  const names = new Map<string, string>()
  const used: Record<string, number> = {}
  const everyone = [{ id: ownId, name: ownName }, ...others.map(p => ({ id: p.id, name: p.name }))].sort((a, b) => a.id.localeCompare(b.id))
  for (const m of everyone) {
    used[m.name] = (used[m.name] ?? 0) + 1
    names.set(m.id, used[m.name] > 1 ? `${m.name} ${used[m.name]}` : m.name)
  }
  const slot = (id: string) => everyone.findIndex(m => m.id === id) % 4
  const machines: Machine[] = [
    { name: names.get(ownId) ?? ownName, mine: true, today: own.today.code, life: own.life.code, seen: now, slot: slot(ownId) },
    ...others.map(p => ({
      name: names.get(p.id) ?? p.name,
      mine: false,
      today: p.d === today ? p.today.code : 0,
      life: p.life.code,
      seen: p.at,
      slot: slot(p.id),
    })),
  ]
  if (mode !== 'both') return { ...own, machines }

  let life = own.life
  let todayC = own.today
  const days = { ...own.days }
  const hours = own.hours.slice()
  let modelsToday = own.modelsToday
  let modelsLife = own.modelsLife
  for (const p of others) {
    life = addC(life, p.life)
    for (const [d, c] of Object.entries(p.days)) days[d] = addC(days[d] ?? EMPTY, c)
    modelsLife = addMap(modelsLife, p.modelsLife)
    if (p.d === today) {
      todayC = addC(todayC, p.today)
      p.hours.forEach((n, i) => (hours[i] = (hours[i] ?? 0) + n))
      modelsToday = addMap(modelsToday, p.modelsToday)
    }
  }

  return { ...own, life, today: todayC, days, hours, modelsToday, modelsLife, machines }
}

/** "now" within ten minutes of a write, else the clock time (or the day, for an older one). */
export const seenLabel = (m: Machine, now: number): string => {
  if (m.mine || now - m.seen < STALE_MS) return 'now'
  const d = new Date(m.seen)
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  return dayKey(m.seen) === dayKey(now) ? t : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${t}`
}
