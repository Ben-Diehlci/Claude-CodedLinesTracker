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
  /** The terminal stage as a Raster `cols` cells wide (repainted by the timer), or null when this surface has none. */
  stage: (cols: number) => any
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

/**
 * Width of a desktop band Svg from the band's columns (bodyColumns already leaves out the [-] mark).
 * The desktop's columns measured about 9 px (Ben's screenshot, 2026-11-03: at 8 px the band filled only
 * two thirds of its slot). Better a little too wide than too narrow: the Svg carries no fixed size, so
 * the app scales a wider drawing down to fit its slot instead of cutting it off.
 */
export const bandWidth = (v: View): number => Math.max(300, Math.min(1400, v.cols * 9 - 12))

export const mileLabel = (v: View): string => `${fmt(Math.floor(v.life.code / MILESTONE) * MILESTONE)} lines!`

export const summary = (v: View): string =>
  `${fmt(v.session.code)} code lines this session, ${fmt(v.session.all)} with comments. ` +
  `${fmt(v.today.code)} today, ${fmt(v.life.code)} all time, level ${v.level}.`

/** Clawd placed inside a band Svg at (x, y), px pixels per square. */
export const clawdAt = (v: View, x: number, y: number, px: number): string =>
  `<g transform="translate(${x},${y})">${clawdBody(px, { working: v.working, asleep: v.asleep, hop: v.hop, outfit: v.outfit, now: v.now })}</g>`

export const clawdWidth = (px: number): number => W * px
export const clawdHeight = (v: View, px: number): number => canvasH(v.outfit) * px

/** The one Svg a desktop band is made of (siblings would wrap). */
export const bandSvg = (k: Kit, v: View, w: number, ht: number, inner: string) => {
  const { Svg } = k.ui

  // No width or height props: the box takes the markup's own size, shrunk to the slot when wider.
  return <Svg key="band" alt={summary(v)} isInteractive source={svgDoc(w, ht, inner)} />
}
