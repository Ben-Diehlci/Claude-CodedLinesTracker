import type { Counts } from '../types'

type Style = { line: string[]; block?: [string, string] }

const SLASH: Style = { line: ['//'], block: ['/*', '*/'] }
const HASH: Style = { line: ['#'] }
const PY: Style = { line: ['#'], block: ['"""', '"""'] }
const DASH: Style = { line: ['--'] }
const HTML: Style = { line: [], block: ['<!--', '-->'] }
const CSS: Style = { line: [], block: ['/*', '*/'] }

const STYLES: Record<string, Style> = {
  js: SLASH, jsx: SLASH, ts: SLASH, tsx: SLASH, mjs: SLASH, c: SLASH, h: SLASH,
  cpp: SLASH, cs: SLASH, java: SLASH, go: SLASH, rs: SLASH, swift: SLASH,
  kt: SLASH, dart: SLASH, scala: SLASH, php: { line: ['//', '#'], block: ['/*', '*/'] },
  scss: SLASH, css: CSS, less: SLASH,
  py: PY, sh: HASH, zsh: HASH, bash: HASH, rb: HASH, yml: HASH, yaml: HASH,
  toml: HASH, pl: HASH, r: HASH, ps1: { line: ['#'], block: ['<#', '#>'] },
  sql: DASH, lua: DASH, hs: DASH,
  html: HTML, htm: HTML, xml: HTML, svg: HTML, vue: HTML,
}

export const extOf = (path: string): string => {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')

  return dot > 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase()
}

/** Classifies each line of `text` as blank, comment or code. A heuristic, not a parser. */
export const countLines = (text: string, ext: string): Counts => {
  const style = STYLES[ext]
  const out: Counts = { all: 0, code: 0, comments: 0, blank: 0 }
  let end: string | null = null

  for (const raw of text.split('\n')) {
    const line = raw.trim()

    if (line === '') {
      out.blank += 1
      continue
    }

    out.all += 1

    if (end !== null) {
      out.comments += 1
      if (line.includes(end)) end = null
      continue
    }

    const open = style?.block
    if (open && line.startsWith(open[0])) {
      out.comments += 1
      if (!line.slice(open[0].length).includes(open[1])) end = open[1]
      continue
    }

    if (style?.line.some(prefix => line.startsWith(prefix))) {
      out.comments += 1
      continue
    }

    out.code += 1
  }

  return out
}
