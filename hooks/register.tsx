import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Counts, Prefs, Pulse, Row, Stats, Totals } from '../types'
import {
  HOP_MS,
  NIGHT_SLEEP_MS,
  SLEEP_MS,
  W,
  cellRows,
  clawdCells,
  clawdSvg,
  frame,
  newAnim,
} from './clawd'
import type { Outfit } from './clawd'
import { BATCH, CLOUD_MODES, FIND_MS, SCAN_MS, cloudTotals, listArgs, parseLog, samePath, showArgs, skipDir } from './cloud'
import type { CloudCommit } from './cloud'
import { countLines, extOf } from './count'
import { IDLE_MS, stageCells, stageLive } from './stage'
import type { StageLive } from './stage'
import {
  BACKGROUNDS,
  EMPTY,
  backgroundOf,
  MILESTONE,
  OUTFIT_CHOICES,
  SECTIONS,
  badgesOf,
  bestDay,
  dayKey,
  defaultPrefs,
  fmt,
  isNight,
  levelOf,
  modelName,
  mergePrefs,
  pickOutfit,
  streaks,
} from './model'
import type { View } from './model'
import { renderPane } from './panes'
import { PEER_PREFIX, WRITE_CHANGED_MS, WRITE_IDLE_MS, expandDir, mergePeers, parsePeer, safeId, toPeerFile } from './peers'
import type { PeerFile } from './peers'
import { DESIGNS, STYLE_CHOICES, pickDesign } from './styles'
import type { Kit } from './styles/common'

const PANE = 'lines-tracker'
const FRAMES = ['(o_o)', '(o_O)', '(O_o)', '(^_^)']

const REFRESH_MS = 5000
// The desktop keeps every open chat's code running, and each checks in every 30 s: a session counts as
// active only when it wrote lines this recently, not just because it is open.
const ACTIVE_MS = 30 * 60_000
const HOT_MS = 15_000
const FOLD_AGE_MS = 60 * 60_000
// How long the green "+N" chip shows after a write (Ben liked it; 3 s went by too fast).
const FLASH_MS = 6000
const MILE_MS = 4000
const PREFIX = 's-'
const KEEP_DAYS = 120

const fresh = (now: number): Stats => ({
  total: { ...EMPTY },
  writes: 0,
  edits: 0,
  byExt: {},
  byFile: {},
  startedAt: now,
})

// Change a tag when the fields of its value change: an older stored value is
// then read as the initial one.
const session = atom({ plugin: 'lines-tracker', key: 'session' } as const, fresh(0), {
  shape: 'stats-1',
})
const prefs = atom(
  { plugin: 'lines-tracker', key: 'prefs' } as const,
  defaultPrefs(),
  { shape: 'prefs-4' },
)
const noTotals = (): Totals => ({
  life: { ...EMPTY },
  today: { ...EMPTY },
  days: {},
  hours: Array(24).fill(0),
  sessions: 1,
  list: [],
  owl: false,
  exts: 0,
  modelsToday: {},
  modelsLife: {},
  machines: [],
})
const totals = atom({ plugin: 'lines-tracker', key: 'totals' } as const, noTotals(), {
  shape: 'totals-5',
})
const pulse = atom({ plugin: 'lines-tracker', key: 'pulse' } as const, { at: 0, n: 0, mile: 0 } as Pulse, {
  shape: 'pulse-2',
})

const add = (a: Counts, b: Counts): Counts => ({
  all: a.all + b.all,
  code: a.code + b.code,
  comments: a.comments + b.comments,
  blank: a.blank + b.blank,
})

const sum = (m: Record<string, number> | undefined): number => Object.values(m ?? {}).reduce((t, n) => t + n, 0)

const top = (map: Record<string, number>, n: number): [string, number][] =>
  Object.entries(map)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)

/* ---- the store: one key per session (written only by its owner), summed on read ---- */

type Own = {
  /** Last check-in. */
  t: number
  /** Last write (the blinking dot). */
  w: number
  /** Project folder name. */
  proj: string
  life: Counts
  days: Record<string, Counts>
  /** Code lines per hour for the day `d`. */
  hours: { d: string; v: number[] }
  owl: boolean
  exts: string[]
  /** Code lines per model, lifetime, and for the day `d`. */
  ml?: Record<string, number>
  mt?: { d: string; v: Record<string, number> }
  /** This session's own stats, a copy of the session atom (memory), so a chat the app put to sleep gets them back. */
  s?: Stats
}
type Base = { life: Counts; days: Record<string, Counts>; folded: string[]; owl?: boolean; exts?: string[]; models?: Record<string, number> }

const keepDays = (days: Record<string, Counts>, n: number): Record<string, Counts> => {
  const out: Record<string, Counts> = {}
  for (const k of Object.keys(days).sort().slice(-n)) out[k] = days[k]

  return out
}

const addMap = (a: Record<string, number>, b: Record<string, number> | undefined): Record<string, number> => {
  const out = { ...a }
  for (const [k, n] of Object.entries(b ?? {})) out[k] = (out[k] ?? 0) + n

  return out
}

const union = (a: string[] | undefined, b: string[] | undefined): string[] => [...new Set([...(a ?? []), ...(b ?? [])])].slice(0, 60)

// Totals folded from finished sessions. Older versions kept plain 'lifetime' and 'days' keys: seed from them.
const loadBase = async ($: any): Promise<Base> => {
  const b = (await $.store.get('base')) as Base | undefined
  if (b) return b

  return {
    life: ((await $.store.get('lifetime')) as Counts | undefined) ?? { ...EMPTY },
    days: ((await $.store.get('days')) as Record<string, Counts> | undefined) ?? {},
    folded: [],
  }
}

const sumSessions = async ($: any, now: number): Promise<Totals> => {
  const self = PREFIX + (await $.session.id())
  const base = await loadBase($)
  const folded = new Set(base.folded)
  const today = dayKey(now)
  let life = base.life
  const days = { ...base.days }
  const hours: number[] = Array(24).fill(0)
  let owl = base.owl ?? false
  let exts = base.exts ?? []
  let modelsLife = base.models ?? {}
  let modelsToday: Record<string, number> = {}
  const list: Row[] = []
  let sessions = 0
  for (const k of (await $.store.keys()) as string[]) {
    if (!k.startsWith(PREFIX) || folded.has(k)) continue
    const o = (await $.store.get(k)) as Own | undefined
    if (!o) continue
    life = add(life, o.life)
    for (const d of Object.keys(o.days)) days[d] = add(days[d] ?? EMPTY, o.days[d])
    if (o.hours?.d === today) o.hours.v.forEach((n, i) => (hours[i] += n))
    owl = owl || !!o.owl
    exts = union(exts, o.exts)
    modelsLife = addMap(modelsLife, o.ml)
    if (o.mt?.d === today) modelsToday = addMap(modelsToday, o.mt.v)
    const wrote = o.w ?? 0
    const active = wrote > 0 && now - wrote < ACTIVE_MS
    if (active) sessions++
    const code = o.days[today]?.code ?? 0
    // Listed: sessions still open that wrote today, and this one.
    if (now - o.t < FOLD_AGE_MS && (code > 0 || k === self)) {
      list.push({ name: o.proj || 'session', code, active: active || k === self, hot: now - wrote < HOT_MS })
    }
  }
  list.sort((a, b) => b.code - a.code)

  return {
    life,
    today: days[today] ?? { ...EMPTY },
    days: keepDays(days, KEEP_DAYS),
    hours,
    sessions: Math.max(1, sessions),
    list: list.slice(0, 6),
    owl,
    exts: exts.length,
    modelsToday,
    modelsLife,
    machines: [],
  }
}

// At session start: sessions idle for an hour move into 'base', so the store stays small.
const fold = async ($: any, self: string, now: number) => {
  const base = await loadBase($)
  const folded = new Set(base.folded)
  const done: string[] = []
  let life = base.life
  const days = { ...base.days }
  let owl = base.owl ?? false
  let exts = base.exts ?? []
  let models = base.models ?? {}
  for (const k of (await $.store.keys()) as string[]) {
    if (!k.startsWith(PREFIX) || k === self) continue
    const o = (await $.store.get(k)) as Own | undefined
    if (!o) continue
    if (!folded.has(k)) {
      if (now - o.t < FOLD_AGE_MS) continue
      life = add(life, o.life)
      for (const d of Object.keys(o.days)) days[d] = add(days[d] ?? EMPTY, o.days[d])
      owl = owl || !!o.owl
      exts = union(exts, o.exts)
      models = addMap(models, o.ml)
    }
    done.push(k)
  }
  if (done.length === 0) return
  await $.store.set('base', {
    life,
    days: keepDays(days, KEEP_DAYS + 30),
    folded: [...base.folded, ...done].slice(-500),
    owl,
    exts,
    models,
  })
  for (const k of done) await $.store.delete(k)
}

// Animation state (terminal drawing; the desktop plays its own timeline).
const anim = newAnim(0)
let lastActive = 0
let flashShown = false
let mileShown = false
let asleepShown = false
let winShown = ''
let morningAt = 0
let lastCells = ''
let ownCache: Own | undefined
let beats = 0
let project = 'session'
let cwd = ''
let curOutfit: Outfit = 'none'
// band/pane: a terminal Raster Clawd to repaint; stage: the terminal stage Raster; scene: a desktop card band with the stage.
const mounted: Record<'band' | 'pane' | 'stage' | 'scene', boolean> = { band: false, pane: false, stage: false, scene: false }
let stage: { live: StageLive; cols: number; cells: string } | undefined
let bandId = 'band'

const sleepAfter = (now: number): number => (isNight(now) ? NIGHT_SLEEP_MS : SLEEP_MS)

const savePrefs = async ($: any) => {
  await $.store.set('prefs', await read($, prefs))
}

const setPrefs = ($: any) => async (patch: Partial<Prefs>) => {
  await update($, prefs, (x: Prefs) => ({ ...x, ...patch }))
  await savePrefs($)
}

const record = async ($: any, path: string, text: string, kind: 'writes' | 'edits') => {
  const ext = extOf(path)
  const counts = countLines(text, ext)
  const now = await $.clock.now()

  await update($, session, (s: Stats) => ({
    ...s,
    startedAt: s.startedAt || now,
    total: add(s.total, counts),
    [kind]: s[kind] + 1,
    byExt: { ...s.byExt, [ext]: (s.byExt[ext] ?? 0) + counts.code },
    byFile: { ...s.byFile, [path]: (s.byFile[path] ?? 0) + counts.all },
  }))

  // Only this session writes its own key, so two sessions can never lose each other's counts.
  const key = PREFIX + (await $.session.id())
  const own = ((await $.store.get(key)) as Own | undefined) ?? newOwn(now)
  const d = dayKey(now)
  const hours = own.hours?.d === d ? [...own.hours.v] : Array<number>(24).fill(0)
  hours[new Date(now).getHours()] += counts.code
  const model = modelName(await sessionModel($))
  const mt = own.mt?.d === d ? { ...own.mt.v } : {}
  mt[model] = (mt[model] ?? 0) + counts.code
  ownCache = {
    t: now,
    w: now,
    proj: own.proj || project,
    life: add(own.life, counts),
    days: keepDays({ ...own.days, [d]: add(own.days[d] ?? EMPTY, counts) }, KEEP_DAYS),
    hours: { d, v: hours },
    ml: addMap(own.ml ?? {}, { [model]: counts.code }),
    mt: { d, v: mt },
    owl: own.owl || (isNight(now) && counts.code > 0),
    exts: counts.code > 0 ? union(own.exts, [ext]) : (own.exts ?? []),
    s: trimStats(await read($, session)),
  }
  await $.store.set(key, ownCache)

  lastActive = now
  anim.asleep = false
  const before = (await read($, totals)).life.code
  await syncTotals($, now)
  const after = (await read($, totals)).life.code
  const crossed = Math.floor(after / MILESTONE) > Math.floor(before / MILESTONE)
  anim.hopUntil = now + (crossed ? 1400 : HOP_MS)
  await update($, pulse, (p: Pulse) => ({ at: now, n: counts.code, mile: crossed ? now : p.mile }))
}

// The chat's main model. Writes by a subagent count under it too (an agent's own model is not offered).
const sessionModel = async ($: any): Promise<string> => {
  try {
    return String((await $.session.model()) ?? '')
  } catch {
    return ''
  }
}

// The saved copy keeps the 40 biggest files, so the key stays small.
const trimStats = (s: Stats): Stats => ({ ...s, byFile: Object.fromEntries(top(s.byFile, 40)) })

let restored = false
let ticking = false

/**
 * After the app puts an idle chat to sleep its memory (the session atom, this module's state) can be gone
 * while the store is kept: bring the session's stats back from its own key, once per load of this code.
 */
const restore = async ($: any) => {
  if (restored) return
  restored = true
  const key = PREFIX + (await $.session.id())
  const own = (await $.store.get(key)) as Own | undefined
  if (own && !ownCache) ownCache = own
  const cur = await read($, session)
  if (own?.s && cur.writes + cur.edits === 0 && own.s.writes + own.s.edits > 0) await update($, session, () => own.s!)
}

// Local timers only: no model call, nothing sent to the model. Started at session start, or again on the
// next draw when this code was loaded without one (a chat woken from sleep).
const startTimers = ($: any) => {
  if (ticking) return
  ticking = true
  $.clock.every(REFRESH_MS, () => void refresh($).catch(() => {}))
  $.clock.every(120, () => void tickAnim($).catch(() => {}))
}

const newOwn = (now: number): Own => ({
  t: now,
  w: 0,
  proj: project,
  life: { ...EMPTY },
  days: {},
  hours: { d: '', v: [] },
  owl: false,
  exts: [],
})

/* ---- two Macs: this Mac's totals go to a file in the synced folder, the other Macs' files are read back ---- */

type Machine = { id: string; name: string }
let machine: Machine | null | undefined
const peerCache = new Map<string, { mtime: number; file: PeerFile | undefined }>()
let lastPublished = { at: 0, json: '' }

/** Who this Mac is: the host name (stable, the file's name) and the model, "MacBook Pro". Null when commands cannot run. */
const whoAmI = async ($: any): Promise<Machine | null> => {
  if (machine !== undefined) return machine
  try {
    const saved = (await $.store.get('machine')) as Machine | undefined
    if (saved?.id) return (machine = saved)
    const host = await $.process.run(['scutil', '--get', 'LocalHostName'])
    const hw = await $.process.run(['system_profiler', 'SPHardwareDataType'])
    const model = /Model Name:\s*(.+)/.exec(hw.stdout)?.[1]?.trim()
    const id = safeId(host.stdout.trim())
    machine = host.exitCode === 0 && host.stdout.trim() ? { id, name: model || 'Mac' } : null
    if (machine) await $.store.set('machine', machine)
  } catch {
    machine = null
  }

  return machine
}

/** The shared folder from the settings (home spelled out), '' when none is set. */
const peerFolder = async ($: any): Promise<string> => {
  const dir = (await read($, prefs)).syncDir
  if (!dir) return ''

  return expandDir(dir, (await $.env.get('HOME')) ?? '')
}

/** Every Mac's file in the folder (read again only when its modified time changed). */
const readPeers = async ($: any): Promise<PeerFile[]> => {
  const dir = await peerFolder($)
  if (!dir) return []
  let entries: { name: string; kind: string; mtimeMs: number }[] = []
  try {
    entries = await $.fs.list(dir)
  } catch {
    return []
  }
  const out: PeerFile[] = []
  for (const e of entries) {
    if (!e.name.startsWith(PEER_PREFIX) || !e.name.endsWith('.json')) continue
    const hit = peerCache.get(e.name)
    if (hit && hit.mtime === e.mtimeMs) {
      if (hit.file) out.push(hit.file)
      continue
    }
    const file = parsePeer(await $.fs.read(`${dir}/${e.name}`).catch(() => ''))
    peerCache.set(e.name, { mtime: e.mtimeMs, file })
    if (file) out.push(file)
  }

  return out
}

const publish = async ($: any, me: Machine, mine: Totals, now: number) => {
  const dir = await peerFolder($)
  if (!dir) return
  const file = toPeerFile(me.id, me.name, now, mine)
  const json = JSON.stringify({ ...file, at: 0 })
  const changed = json !== lastPublished.json
  const wait = changed ? WRITE_CHANGED_MS : WRITE_IDLE_MS
  if (now - lastPublished.at < wait) return
  lastPublished = { at: now, json }
  await $.fs.write(`${dir}/${PEER_PREFIX}${me.id}.json`, JSON.stringify(file))
}

const syncTotals = async ($: any, now: number) => {
  const mine = await sumSessions($, now)
  const p = await read($, prefs)
  const cloud = p.cloud !== 'off' ? ((await $.store.get(CLOUD_TOTALS)) as PeerFile | undefined) : undefined
  const hasCloud = !!cloud && cloud.life.all > 0
  const synced = !!(await peerFolder($))
  const me = synced || hasCloud ? await whoAmI($) : null
  let next = mine
  if (me || hasCloud) {
    if (me && synced) await publish($, me, mine, now).catch(() => {})
    const peers = me && synced ? await readPeers($) : []
    const self = me ?? { id: 'this-computer', name: 'This computer' }
    next = mergePeers(mine, self.id, self.name, hasCloud ? [...peers, cloud!] : peers, now, p.count)
  }
  const cur = await read($, totals)
  if (JSON.stringify(cur) !== JSON.stringify(next)) await update($, totals, () => next)
}

/* ---- cloud sessions: their lines, read from the git commits they made (cloud.ts) ---- */

const CLOUD_COMMITS = 'cloud-commits'
const CLOUD_STATE = 'cloud-state'
const CLOUD_TOTALS = 'cloud-totals'
/** Folders searched below the home folder for repos, and at most how many folders are looked into. */
const FIND_DEPTH = 5
const FIND_VISITS = 20_000
type CloudState = { scanAt: number; findAt: number; found: string[]; seen: string[]; repos: number }
const noCloudState = (): CloudState => ({ scanAt: 0, findAt: 0, found: [], seen: [], repos: 0 })
let scanning = false
let nextCloudCheck = 0

/** Every repo below the home folder (mode "all"): a folder holding `.git` is one, and its insides are not searched. */
const findRepos = async ($: any): Promise<string[]> => {
  const home = ((await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? '').replace(/[\\/]+$/, '')
  if (!home) return []
  const out: string[] = []
  const queue: { dir: string; depth: number }[] = [{ dir: home, depth: 0 }]
  let visits = 0
  while (queue.length > 0 && visits < FIND_VISITS) {
    const { dir, depth } = queue.shift()!
    visits++
    let entries: { name: string; kind: string }[] = []
    try {
      entries = await $.fs.list(dir)
    } catch {
      continue
    }
    if (entries.some(e => e.name === '.git' && e.kind !== 'other')) {
      out.push(dir)
      continue
    }
    if (depth >= FIND_DEPTH) continue
    for (const e of entries) if (e.kind === 'dir' && !skipDir(e.name)) queue.push({ dir: `${dir}/${e.name}`, depth: depth + 1 })
  }

  return out
}

/** The repo a folder is in (its top folder), or '' when it is in none. */
const repoOf = async ($: any, dir: string): Promise<string> => {
  if (!dir) return ''
  try {
    const r = await $.process.run(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { timeoutMs: 10_000 })

    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

const isHash = (h: string) => /^[0-9a-f]{40,64}$/.test(h)

/** Reads the given commits' added lines, halving the batch when git's output was cut at 4 MiB. */
const readCommits = async ($: any, repo: string, hashes: string[]): Promise<Record<string, CloudCommit>> => {
  let r
  try {
    r = await $.process.run(showArgs(repo, hashes), { timeoutMs: 120_000 })
  } catch {
    return {}
  }
  if (r.exitCode !== 0) return {}
  if (r.isStdoutTruncated && hashes.length > 1) {
    const half = Math.ceil(hashes.length / 2)

    return { ...(await readCommits($, repo, hashes.slice(0, half))), ...(await readCommits($, repo, hashes.slice(half))) }
  }
  const got = parseLog(r.stdout, repo)
  // A commit git listed but that holds no lines to count is kept as empty, so it is not read again.
  for (const h of hashes) got[h] ??= { at: 0, s: '', m: '', q: false, k: h, c: { ...EMPTY }, x: {}, r: repo }

  return got
}

/** The repos read: in "all" every one found plus those chats ran in plus those added; in "picked" those added. */
const cloudRepos = (p: Prefs, st: CloudState): string[] => {
  const list = p.cloud === 'all' ? [...st.found, ...st.seen, ...p.cloudRepos] : p.cloudRepos
  const out: string[] = []
  for (const r of list) if (r && !out.some(x => samePath(x, r))) out.push(r)

  return out
}

/** Works the cloud lines out again from the commits kept (after a scan, or the mode or repo list changed). */
const rebuildCloud = async ($: any, now: number) => {
  const p = await read($, prefs)
  const all = Object.values(((await $.store.get(CLOUD_COMMITS)) ?? {}) as Record<string, CloudCommit>)
  const use = p.cloud === 'picked' ? all.filter(c => p.cloudRepos.some(r => samePath(r, c.r))) : all
  await $.store.set(CLOUD_TOTALS, cloudTotals(use, now))
}

/**
 * Every few minutes one chat asks each repo for cloud commits it has not read yet (the store says when the
 * last ask was, so the other chats skip). Only git on this computer: nothing is fetched from the network.
 */
const cloudScan = async ($: any, force = false) => {
  if (scanning) return
  const now = await $.clock.now()
  if (!force && now < nextCloudCheck) return
  nextCloudCheck = now + 60_000
  const p = await read($, prefs)
  if (p.cloud === 'off') return
  const st = { ...noCloudState(), ...(((await $.store.get(CLOUD_STATE)) ?? {}) as Partial<CloudState>) }
  if (!force && now - st.scanAt < SCAN_MS) return
  scanning = true
  try {
    await $.store.set(CLOUD_STATE, { ...st, scanAt: now })
    if (p.cloud === 'all' && (force || now - st.findAt > FIND_MS)) {
      st.found = await findRepos($)
      st.findAt = now
    }
    const here = await repoOf($, cwd)
    if (here && !st.seen.some(x => samePath(x, here))) st.seen = [...st.seen, here].slice(-200)
    const repos = cloudRepos(p, st)
    const commits = ((await $.store.get(CLOUD_COMMITS)) ?? {}) as Record<string, CloudCommit>
    let added = 0
    for (const repo of repos) {
      let listed
      try {
        listed = await $.process.run(listArgs(repo), { timeoutMs: 60_000 })
      } catch {
        continue
      }
      if (listed.exitCode !== 0) continue
      const hashes: string[] = String(listed.stdout).split('\n').map(h => h.trim())
      const fresh = [...new Set(hashes)].filter(h => isHash(h) && !commits[h])
      for (let i = 0; i < fresh.length; i += BATCH) {
        const got = await readCommits($, repo, fresh.slice(i, i + BATCH))
        Object.assign(commits, got)
        added += Object.keys(got).length
      }
    }
    if (added > 0) await $.store.set(CLOUD_COMMITS, commits)
    await $.store.set(CLOUD_STATE, { ...st, scanAt: now, repos: repos.length })
    await rebuildCloud($, now)
    await syncTotals($, now)
  } finally {
    scanning = false
  }
}

/**
 * A session key from before per-model tracking: its lines so far go to the model the chat runs now
 * (Ben rarely switches models inside one chat), so the rings fill at once instead of starting grey.
 */
const seedModels = async ($: any, own: Own, now: number): Promise<Own> => {
  if (own.ml) return own
  const model = modelName(await sessionModel($))
  const d = dayKey(now)
  const today = own.days[d]?.code ?? 0

  return { ...own, ml: own.life.code > 0 ? { [model]: own.life.code } : {}, mt: { d, v: today > 0 ? { [model]: today } : {} } }
}

/** The day's first chat marks the morning (in the store, shared by every chat): the stage plays its wake-up scene. */
const checkMorning = async ($: any, now: number) => {
  const d = dayKey(now)
  const m = (await $.store.get('morning')) as { d: string; at: number } | undefined
  if (m?.d === d) morningAt = m.at
  else {
    morningAt = now
    await $.store.set('morning', { d, at: now })
  }
}

// Every few seconds: show other sessions' lines, keep this session's key alive, redraw on a timed change.
const refresh = async ($: any) => {
  const now = await $.clock.now()
  const key = PREFIX + (await $.session.id())
  if (ownCache && (++beats % 6 === 0 || !ownCache.ml || !((await $.store.keys()) as string[]).includes(key))) {
    ownCache = { ...(await seedModels($, ownCache, now)), t: now }
    await $.store.set(key, ownCache)
  }
  await syncTotals($, now)
  void cloudScan($).catch(() => {})

  const asleep = now - lastActive > sleepAfter(now)
  const p = await read($, pulse)
  const flashing = now - p.at < FLASH_MS
  const miling = p.mile > 0 && now - p.mile < MILE_MS
  // A new 30 s window brings the stage's next scene (the band Svg only changes when it is redrawn).
  await checkMorning($, now)
  const win = `${Math.floor(now / IDLE_MS)}:${now - morningAt < IDLE_MS}`
  if (asleep !== asleepShown || flashing !== flashShown || miling !== mileShown || (mounted.scene && win !== winShown)) {
    winShown = win
    asleepShown = asleep
    flashShown = flashing
    mileShown = miling
    anim.asleep = asleep
    $.ui.invalidate('ui.render')
  }
}

// Terminal only: repaint the Raster Clawd and the card's stage in place, no redraw.
const tickAnim = async ($: any) => {
  if (!mounted.band && !mounted.pane && !mounted.stage) return
  const now = await $.clock.now()
  anim.asleep = now - lastActive > sleepAfter(now)
  const cells = clawdCells(frame(anim, now), curOutfit)
  if (cells !== lastCells) {
    lastCells = cells
    const targets: ['band' | 'pane', string][] = [['band', bandId], ['pane', PANE]]
    for (const [name, requestId] of targets) {
      if (!mounted[name]) continue
      const r = await $.ui.blit({ requestId, key: 'clawd', cells })
      if ('deny' in r) mounted[name] = false
    }
  }
  if (mounted.stage && stage) {
    const sc = stageCells({ ...stage.live, asleep: anim.asleep }, now, stage.cols)
    if (sc === stage.cells) return
    stage.cells = sc
    const r = await $.ui.blit({ requestId: bandId, key: 'stage', cells: sc })
    if ('deny' in r) mounted.stage = false
  }
}

/** Everything a design needs, worked out once per draw. */
const buildView = async ($: any, e: any, p: Prefs): Promise<View> => {
  await restore($)
  startTimers($)
  const s = await read($, session)
  const t = await read($, totals)
  const pu = await read($, pulse)
  const now = await $.clock.now()
  const lv = levelOf(t.life.code)
  const { streak, best } = streaks(t.days, now)
  const minutes = Math.max(1, (now - (s.startedAt || now)) / 60000)

  return {
    now,
    surface: e.surface,
    cols: (e.props as { bodyColumns?: number }).bodyColumns ?? 120,
    paneRows: (e.props as { scroll?: { bodyRows?: number } }).scroll?.bodyRows ?? 0,
    working: !!(e.props as { isWorking?: boolean }).isWorking,
    asleep: now - lastActive > sleepAfter(now),
    hop: now - pu.at < HOP_MS,
    mascot: p.mascot,
    outfit: pickOutfit(p.outfit, now),
    session: s.total,
    today: t.today,
    life: t.life,
    flash: now - pu.at < FLASH_MS ? pu.n : 0,
    flashAt: pu.at,
    morningAt,
    mile: pu.mile > 0 && now - pu.mile < MILE_MS,
    mileAt: pu.mile,
    modelsToday: top(t.modelsToday ?? {}, 8),
    modelsLife: top(t.modelsLife ?? {}, 8),
    earlierToday: Math.max(0, t.today.code - sum(t.modelsToday)),
    earlierLife: Math.max(0, t.life.code - sum(t.modelsLife)),
    level: lv.level,
    xp: lv.xp,
    toNext: lv.toNext,
    nextAt: lv.next,
    streak,
    bestStreak: best,
    best: bestDay(t.days),
    hours: t.hours,
    rows: t.list,
    sessions: t.sessions,
    machines: t.machines ?? [],
    countBoth: p.count !== 'this',
    badges: badgesOf(t, best),
    days: t.days,
    minutes,
    writes: s.writes,
    edits: s.edits,
    byExt: top(s.byExt, 5),
    byFile: top(s.byFile, 5),
    files: Object.keys(s.byFile).length,
  }
}

const kitFor = ($: any, e: any, v: View): Kit => {
  const ui = $.ui.resolve(e) as any
  const { Raster } = ui

  return {
    ui,
    face: FRAMES[Math.floor(v.now / 400) % FRAMES.length],
    clawdSvg: (px: number) => clawdSvg(px, { working: v.working, asleep: v.asleep, hop: v.hop, outfit: v.outfit, now: v.now }),
    stage: (cols: number) => {
      if (e.surface !== 'terminal' || !Raster) return null
      stage = { live: stageLive(v), cols, cells: '' }
      stage.cells = stageCells(stage.live, v.now, cols)
      mounted.stage = true

      return <Raster key="stage" columns={cols} rows={1} cells={stage.cells} />
    },
    raster: () =>
      e.surface === 'terminal' && Raster ? (
        <Raster key="clawd" columns={W} rows={cellRows(v.outfit)} cells={clawdCells(frame(anim, v.now), v.outfit)} />
      ) : null,
  }
}

const SECTION_IDS = SECTIONS.map(s => s.id as string)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = (await $.store.get('prefs')) as Partial<Prefs> | undefined
    if (saved) await update($, prefs, () => mergePrefs(saved))

    const now = await $.clock.now()
    Object.assign(anim, newAnim(now))
    lastActive = now
    cwd = (e as { cwd?: string }).cwd ?? ''
    project = cwd.split('/').filter(Boolean).pop() || 'session'
    const self = PREFIX + (await $.session.id())
    await fold($, self, now)
    await checkMorning($, now)
    ownCache = ((await $.store.get(self)) as Own | undefined) ?? newOwn(now)
    ownCache = { ...(await seedModels($, ownCache, now)), t: now, proj: project }
    await $.store.set(self, ownCache)
    restored = false
    await restore($)
    await syncTotals($, now)

    await $.command.register({
      name: 'linecount',
      description:
        'Lines tracker: /linecount [show|status|pane|mascot|reset] [on|off], style <name>, outfit <name>, background <name>, section <name> on|off, cloud [all|picked|off|add|remove|scan]',
    })

    startTimers($)

    const p = await read($, prefs)
    if (p.pane) void $.ui.open({ id: PANE, title: 'Lines written' })

    return next(e)
  })

  on('command.run', { command: 'linecount' }, async ($, e) => {
    const [what = 'show', value, extra] = e.args.trim().split(/\s+/)
    const keys = ['status', 'pane', 'mascot'] as const
    const set = setPrefs($)

    if (what === 'reset') {
      await update($, session, () => fresh(0))
      if (ownCache) {
        ownCache = { ...ownCache, s: fresh(0) }
        await $.store.set(PREFIX + (await $.session.id()), ownCache)
      }

      return { text: 'Session line counts reset. Lifetime totals are kept.' }
    }

    if ((keys as readonly string[]).includes(what)) {
      const key = what as (typeof keys)[number]
      const now = value === 'on' ? true : value === 'off' ? false : !(await read($, prefs))[key]
      await set({ [key]: now })
      if (key === 'pane' && now) await $.ui.open({ id: PANE, title: 'Lines written' })

      return { text: `${key}: ${now ? 'on' : 'off'}` }
    }

    if (what === 'count') {
      if (value !== 'both' && value !== 'this') return { text: 'count: both (every Mac) or this (this Mac only)' }
      await set({ count: value })
      await syncTotals($, await $.clock.now())

      return { text: `count: ${value}` }
    }

    if (what === 'sync') {
      const rest = e.args.trim().replace(/^\S+\s*/, '')
      const home = (await $.env.get('HOME')) ?? ''
      if (!rest) {
        const dir = await peerFolder($)

        return { text: dir ? `sync folder: ${dir}` : 'sync folder: none (each Mac counts alone). Set one with /linecount sync <folder>, clear it with /linecount sync off.' }
      }
      if (rest === 'off') {
        await set({ syncDir: '' })
        peerCache.clear()
        lastPublished = { at: 0, json: '' }
        await syncTotals($, await $.clock.now())

        return { text: 'sync folder: none. This Mac counts alone; its file in the old folder is left there.' }
      }
      const dir = expandDir(rest, home)
      if (!dir.startsWith('/') || !(await $.fs.exists(dir))) return { text: `sync: ${dir} is not an existing folder. Make it first (in a folder your sync tool covers), then run this again.` }
      await set({ syncDir: dir })
      peerCache.clear()
      lastPublished = { at: 0, json: '' }
      await syncTotals($, await $.clock.now())

      return { text: `sync folder: ${dir}. Run the same command on every Mac, with the folder that Mac's sync tool shares.` }
    }

    if (what === 'computers') {
      const dir = await peerFolder($)
      const t = await read($, totals)
      const list = t.machines.map(m => `${m.name}${m.mine ? ' (this one)' : ''}: ${m.today} today, ${m.life} all time`).join('; ')
      if (!dir) return { text: list ? `Computers: no sync folder set, so no other Mac is counted. ${list}.` : 'Computers: no sync folder set, so each Mac counts alone. Use /linecount sync <folder>.' }
      const me = await whoAmI($)
      if (!me) return { text: 'Computers: this build cannot run commands here, so the two-Mac count is off.' }

      return { text: `This Mac: ${me.name} (${me.id}). Folder: ${dir}. ${list || 'no other Mac has left a file yet'}.` }
    }

    if (what === 'cloud') {
      const p = await read($, prefs)
      const rest = e.args.trim().replace(/^\S+\s*/, '').replace(/^\S+\s*/, '')
      const now = await $.clock.now()
      const home = (await $.env.get('HOME')) ?? ''
      if ((CLOUD_MODES as readonly string[]).includes(value ?? '')) {
        if (value === 'picked' && p.cloudRepos.length === 0) return { text: 'cloud: no repos picked yet. Add one first with /linecount cloud add <repo folder>.' }
        await set({ cloud: value })
        nextCloudCheck = 0
        await rebuildCloud($, now)
        await syncTotals($, now)
        if (value !== 'off') void cloudScan($, true).catch(() => {})
        const reads = value === 'all' ? 'every repo below your home folder, every repo a chat ran in, and any you added' : value === 'picked' ? `only the repos you added (${p.cloudRepos.length})` : 'nothing; cloud lines are left out'

        return { text: `cloud: ${value}. Reads ${reads}.` }
      }
      if (value === 'add' || value === 'remove') {
        if (!rest) return { text: `cloud ${value}: give a repo folder, for example /linecount cloud ${value} ~/code/my-app` }
        const dir = expandDir(rest, home)
        if (value === 'remove') {
          const left = p.cloudRepos.filter(r => !samePath(r, dir))
          if (left.length === p.cloudRepos.length) return { text: `cloud remove: ${dir} is not in the list. Picked: ${p.cloudRepos.join(', ') || 'none'}.` }
          await set({ cloudRepos: left, ...(left.length === 0 && p.cloud === 'picked' ? { cloud: 'all' } : {}) })
          await rebuildCloud($, now)
          await syncTotals($, now)

          return { text: `cloud: removed ${dir}.${left.length === 0 && p.cloud === 'picked' ? ' No repos left, so back to all.' : ''}` }
        }
        const top = await repoOf($, dir)
        if (!top) return { text: `cloud add: ${dir} is not in a git repo.` }
        if (!p.cloudRepos.some(r => samePath(r, top))) await set({ cloudRepos: [...p.cloudRepos, top] })
        void cloudScan($, true).catch(() => {})

        return { text: `cloud: added ${top}.${p.cloud === 'all' ? ' (Mode is all, so it was read anyway; /linecount cloud picked reads only the ones you add.)' : ''}` }
      }
      if (value === 'scan') {
        await cloudScan($, true)
      }
      const st = { ...noCloudState(), ...(((await $.store.get(CLOUD_STATE)) ?? {}) as Partial<CloudState>) }
      const ct = (await $.store.get(CLOUD_TOTALS)) as ReturnType<typeof cloudTotals> | undefined
      const today = ct && ct.d === dayKey(now) ? ct.today.code : 0
      const counted = ct ? `${fmt(today)} code lines today, ${fmt(ct.life.code)} all time, from ${fmt(ct.commits)} commits in ${fmt(ct.sessions)} cloud sessions` : 'nothing counted yet'
      const repos = p.cloud === 'picked' ? `picked: ${p.cloudRepos.join(', ')}` : p.cloud === 'all' ? `${st.repos} repos read${p.cloudRepos.length ? `, including ${p.cloudRepos.length} added` : ''}` : 'off'
      const when = st.scanAt ? ` Last looked ${new Date(st.scanAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.` : ''

      return { text: `cloud: ${p.cloud} (${repos}). ${counted}.${when} Change with /linecount cloud all|picked|off, add|remove <repo>, scan.` }
    }

    if (what === 'style') {
      if (!value || !STYLE_CHOICES.includes(value)) return { text: `style: one of ${STYLE_CHOICES.join(', ')}` }
      await set({ style: value })

      return { text: `style: ${value}` }
    }

    if (what === 'outfit') {
      if (!value || !(OUTFIT_CHOICES as readonly string[]).includes(value)) return { text: `outfit: one of ${OUTFIT_CHOICES.join(', ')}` }
      await set({ outfit: value })

      return { text: `outfit: ${value}` }
    }

    if (what === 'background') {
      const ids = BACKGROUNDS.map(b => b.id as string)
      if (!value || !ids.includes(value)) return { text: `background: one of ${ids.join(', ')}` }
      await set({ bg: value })

      return { text: `pane background: ${backgroundOf(value).label}` }
    }

    if (what === 'goal') return { text: 'the daily goal was removed; the rings now show lines by model' }

    if (what === 'section') {
      const id = SECTION_IDS.find(x => x === value?.toLowerCase())
      if (!id) return { text: `section: one of ${SECTION_IDS.join(', ')}, then on or off` }
      const cur = (await read($, prefs)).sections
      const now = extra === 'on' ? true : extra === 'off' ? false : cur[id] === false
      await set({ sections: { ...cur, [id]: now } })

      return { text: `section ${id}: ${now ? 'on' : 'off'}` }
    }

    await $.ui.open({ id: PANE, title: 'Lines written' })
    const s = await read($, session)

    return {
      text: `Session: ${fmt(s.total.code)} code, ${fmt(s.total.all)} with comments, ${fmt(s.total.blank)} blank skipped.`,
    }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.file_path, e.content, 'writes')
    }

    return ran
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await record($, e.file_path, e.new_string, 'edits')
    }

    return ran
  })

  // The band above the prompt: drawn by whichever design is chosen.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.status || e.props.hasSurvey) {
      mounted.band = false
      mounted.stage = false
      mounted.scene = false

      return next(e)
    }

    const v = await buildView($, e, p)
    const design = pickDesign(p.style, v.cols, await $.session.id())
    anim.working = v.working
    anim.asleep = v.asleep
    curOutfit = v.outfit
    const terminal = e.surface === 'terminal'
    mounted.band = p.mascot && terminal && design.id !== 'compact'
    mounted.stage = false
    // Every desktop design can show the stage's scenes.
    mounted.scene = !terminal
    if (terminal) {
      bandId = (e as { requestId?: string }).requestId ?? 'band'
      lastCells = ''
    }
    const kit = kitFor($, e, v)

    return terminal ? design.terminal(v, kit) : design.desktop(v, kit)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const p = await read($, prefs)
    if (!p.mascot) return next(e)

    const s = await read($, session)
    const now = await $.clock.now()
    lastActive = now
    const frameFace = FRAMES[Math.floor(now / 400) % FRAMES.length]

    return next({
      ...e,
      props: { ...e.props, suffix: ` ${frameFace} ${fmt(s.total.code)} lines` },
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const p = await read($, prefs)
    const v = await buildView($, e, p)
    curOutfit = v.outfit
    mounted.pane = p.mascot && e.surface === 'terminal' && p.sections.header !== false
    if (mounted.pane) lastCells = ''

    return renderPane({ kit: kitFor($, e, v), v, p, set: setPrefs($), header: { px: 5 } })
  })
}
