// Pieces the band designs share.
import { MILESTONE, fmt } from '../model'
import type { View } from '../model'
import { canvasH, clawdBody, W } from '../clawd'
import { svgDoc } from '../draw'

/** What a design needs besides the View: the host's elements, and Clawd for the terminal. */
export type Kit = {
  ui: any
  /** The terminal Clawd as a Raster element, or null when this surface has none. */
  raster: () => any
  /** Clawd as his own Svg source (for the classic band). */
  clawdSvg: (px: number) => string
  /** A text face for designs without a Clawd drawing. */
  face: string
}

export type Design = {
  id: string
  name: string
  desktop: (v: View, k: Kit) => any
  terminal: (v: View, k: Kit) => any
}

export const CLAY = '#D97757'
export const SAND = '#E3C79A'
export const FLASH = '#7FB069'
export const GOLD = '#E8B84A'

/** Width of a desktop band Svg: the column less room for the host's [-] collapse mark. */
export const bandWidth = (v: View): number => Math.max(300, Math.min(1200, v.cols * 8 - 96))

export const mileLabel = (v: View): string => `${fmt(Math.floor(v.life.code / MILESTONE) * MILESTONE)} lines!`

export const summary = (v: View): string =>
  `${fmt(v.session.code)} code lines this session, ${fmt(v.session.all)} with comments. ` +
  `${fmt(v.today.code)} of ${fmt(v.goal)} today, ${fmt(v.life.code)} all time, level ${v.level}.`

/** Clawd placed inside a band Svg at (x, y), px pixels per square. */
export const clawdAt = (v: View, x: number, y: number, px: number): string =>
  `<g transform="translate(${x},${y})">${clawdBody(px, { working: v.working, asleep: v.asleep, hop: v.hop, outfit: v.outfit })}</g>`

export const clawdWidth = (px: number): number => W * px
export const clawdHeight = (v: View, px: number): number => canvasH(v.outfit) * px

/** The one Svg a desktop band is made of (siblings would wrap). */
export const bandSvg = (k: Kit, v: View, w: number, ht: number, inner: string) => {
  const { Svg } = k.ui

  return <Svg key="band" alt={summary(v)} isInteractive width={w} height={ht} source={svgDoc(w, ht, inner)} />
}
