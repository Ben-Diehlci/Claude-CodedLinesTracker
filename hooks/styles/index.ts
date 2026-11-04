// The band designs. A new design is one new file here plus one line in this list.
import { arcade } from './arcade'
import { card } from './card'
import { classic } from './classic'
import { compact } from './compact'
import type { Design } from './common'

export const DESIGNS: Design[] = [classic, card, arcade, compact]

/** Narrower than this many columns, "auto" picks the compact one-liner. */
export const NARROW_COLS = 70

/** A small stable number from a string (the same chat always gets the same design). */
const hash = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0

  return h
}

/**
 * The design for a saved choice: "auto" = card, or compact when the band is narrow; "random" = one
 * design per chat, picked from the chat's id (compact when the band is narrow, as with auto).
 */
export const pickDesign = (id: string, cols: number, sessionId = ''): Design => {
  if (id === 'auto' || (id === 'random' && cols < NARROW_COLS)) return DESIGNS.find(d => d.id === (cols < NARROW_COLS ? 'compact' : 'card'))!
  if (id === 'random') return DESIGNS[hash(sessionId) % DESIGNS.length]!

  return DESIGNS.find(d => d.id === id) ?? DESIGNS.find(d => d.id === 'card')!
}

export const STYLE_CHOICES = ['auto', 'random', ...DESIGNS.map(d => d.id)]
