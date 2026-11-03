// The band designs. A new design is one new file here plus one line in this list.
import { arcade } from './arcade'
import { card } from './card'
import { classic } from './classic'
import { compact } from './compact'
import type { Design } from './common'

export const DESIGNS: Design[] = [classic, card, arcade, compact]

/** Narrower than this many columns, "auto" picks the compact one-liner. */
export const NARROW_COLS = 70

/** The design for a saved choice ("auto" = card, or compact when the band is narrow). */
export const pickDesign = (id: string, cols: number): Design => {
  if (id === 'auto') return DESIGNS.find(d => d.id === (cols < NARROW_COLS ? 'compact' : 'card'))!

  return DESIGNS.find(d => d.id === id) ?? DESIGNS.find(d => d.id === 'card')!
}

export const STYLE_CHOICES = ['auto', ...DESIGNS.map(d => d.id)]
