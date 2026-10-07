import type { Snap } from '../types'
import type { Theme } from './themes'

export const WIDTH = 880
export const HEIGHT = 1060

const MONO = "'Cascadia Code','JetBrains Mono','SF Mono',Consolas,Menlo,monospace"
const HAND = "'Segoe Print','Bradley Hand','Ink Free','Comic Sans MS',cursive"
const SANS = "'Segoe UI',-apple-system,'Helvetica Neue',Arial,sans-serif"

// Card and photo geometry; everything else is laid out from these.
const CARD = { x: 80, y: 70, w: 720, h: 900 }
const PHOTO = { x: CARD.x + 36, y: CARD.y + 36, w: 648, h: 620 }
const TITLE_BAR = 44
const TEXT = {
  x: PHOTO.x + 28,
  y: PHOTO.y + TITLE_BAR + 30,
  w: PHOTO.w - 56,
  h: PHOTO.h - TITLE_BAR - 30 - 28,
}
const FONT_SIZES = [34, 30, 26, 22, 19, 16] as const

export const escapeXml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const MASK = '••••••'
const SECRET_PATTERNS: readonly RegExp[] = [
  /sk-(?:ant-)?[A-Za-z0-9_-]{16,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
]
const ASSIGNED_SECRET = /\b(password|passwd|pwd|secret|token|api[_-]?key)(\s*[:=]\s*)(\S+)/gi

/** Masks API keys, tokens, JWTs, `password=...` values and e-mail addresses. */
export const redact = (text: string): string =>
  SECRET_PATTERNS.reduce(
    (acc, pattern) => acc.replace(pattern, MASK),
    text.replace(ASSIGNED_SECRET, (_, key: string, sep: string) => `${key}${sep}${MASK}`),
  )

/** Drops harness wrappers and normalizes whitespace so only the person's words remain. */
export const cleanPrompt = (text: string): string =>
  text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<\/?(?:command-[a-z-]+|local-command-[a-z-]+)>/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const unquote = (text: string): string => text.replace(/^(["'])([\s\S]*)\1$/, '$2')

/** Whether `/polaroid <args>` is literal text rather than a pick (`last`, `first`, a number). */
export const isCustomText = (args: string): boolean => !/^(|last|first|\d+)$/i.test(args.trim())

/**
 * Which text `/polaroid <args>` snaps, from the person's prompts oldest first:
 * empty or `last` the newest, `first` the oldest, `n` the nth-last, anything
 * else is the text itself (surrounding quotes dropped).
 */
export const choosePrompt = (prompts: readonly string[], args: string): { text: string } | { error: string } => {
  const pick = args.trim()
  if (isCustomText(pick)) {
    const text = unquote(pick).trim()

    return text === '' ? { error: 'Nothing to snap: the quotes were empty.' } : { text }
  }
  if (prompts.length === 0) return { error: 'No prompt to snap yet. Send one first, or try /polaroid "your text".' }
  const word = pick.toLowerCase()
  const index = word === 'first' ? 0 : prompts.length - (word === '' || word === 'last' ? 1 : Number(pick))
  const text = prompts[index]
  // `0` and numbers past the oldest prompt land outside the list.
  if (text === undefined) {
    const count = prompts.length === 1 ? '1 prompt' : `${prompts.length} prompts`

    return { error: `Only ${count} in this session so far: try /polaroid first, or a number from 1 to ${prompts.length}.` }
  }

  return { text }
}

const length = (text: string): number => Array.from(text).length

const hardSplit = (word: string, width: number): string[] => {
  const chars = Array.from(word)
  const parts: string[] = []
  for (let i = 0; i < chars.length; i += width) parts.push(chars.slice(i, i + width).join(''))

  return parts
}

/** Word-wraps by character count (the prompt is drawn in a monospace font). */
export const wrap = (text: string, width: number): string[] => {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const pieces = length(word) > width ? hardSplit(word, width) : [word]
      for (const piece of pieces) {
        const candidate = line === '' ? piece : `${line} ${piece}`
        if (length(candidate) <= width) {
          line = candidate
        } else {
          lines.push(line)
          line = piece
        }
      }
    }
    lines.push(line)
  }

  return lines
}

export type Layout = { fontSize: number; lineHeight: number; lines: string[]; isTruncated: boolean }

/** Picks the largest font size whose wrapped lines fit the photo, truncating at the smallest. */
export const layout = (text: string): Layout => {
  for (const fontSize of FONT_SIZES) {
    const lineHeight = Math.round(fontSize * 1.45)
    // Two columns go to the "> " glyph and the hanging indent under it.
    const columns = Math.floor(TEXT.w / (fontSize * 0.6)) - 2
    const rows = Math.floor(TEXT.h / lineHeight)
    const lines = wrap(text, columns)
    const isLast = fontSize === FONT_SIZES[FONT_SIZES.length - 1]
    if (lines.length <= rows) return { fontSize, lineHeight, lines, isTruncated: false }
    if (isLast) {
      const kept = lines.slice(0, rows)
      const tail = Array.from(kept[rows - 1] ?? "")
      kept[rows - 1] = `${tail.slice(0, Math.max(0, columns - 1)).join('')}…`

      return { fontSize, lineHeight, lines: kept, isTruncated: true }
    }
  }

  return { fontSize: 16, lineHeight: 23, lines: [], isTruncated: false }
}

export type RenderOptions = {
  theme: Theme
  handle: string
  showModel: boolean
  tilt: boolean
}

/** The whole Polaroid as one self-contained SVG document. */
export const renderSvg = (snap: Snap, options: RenderOptions): string => {
  const { theme } = options
  const { fontSize, lineHeight, lines } = layout(snap.text)
  const angle = options.tilt ? -1.6 : 0
  const cx = CARD.x + CARD.w / 2
  const cy = CARD.y + CARD.h / 2

  const background =
    theme.stops.length === 0
      ? ''
      : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${theme.stops
          .map(
            (stop, i) =>
              `<stop offset="${theme.stops.length === 1 ? 0 : i / (theme.stops.length - 1)}" stop-color="${stop}"/>`,
          )
          .join('')}</linearGradient></defs><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>`

  const promptLines = lines
    .map((line, i) => {
      const y = TEXT.y + fontSize + i * lineHeight
      const glyph = i === 0 ? `<tspan fill="${theme.accent}" font-weight="700">&gt; </tspan>` : '  '

      return `<text x="${TEXT.x}" y="${y}" xml:space="preserve">${glyph}${escapeXml(line)}</text>`
    })
    .join('')

  const title = escapeXml(`claude — ${snap.project}`)
  const model = options.showModel && snap.model !== '' ? escapeXml(snap.model) : ''
  const handle = escapeXml(options.handle.trim())
  const captionY = PHOTO.y + PHOTO.h

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
    background,
    `<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.35"/></filter></defs>`,
    `<g transform="rotate(${angle} ${cx} ${cy})">`,
    // The card
    `<rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="6" fill="#FBFAF7" filter="url(#shadow)"/>`,
    // The photo: a dark terminal window, CodeSnap style
    `<rect x="${PHOTO.x}" y="${PHOTO.y}" width="${PHOTO.w}" height="${PHOTO.h}" rx="10" fill="#1E1E2A"/>`,
    `<path d="M${PHOTO.x} ${PHOTO.y + TITLE_BAR}V${PHOTO.y + 10}a10 10 0 0 1 10 -10H${PHOTO.x + PHOTO.w - 10}a10 10 0 0 1 10 10V${PHOTO.y + TITLE_BAR}Z" fill="#2A2A38"/>`,
    ...['#FF5F57', '#FEBC2E', '#28C840'].map(
      (fill, i) => `<circle cx="${PHOTO.x + 22 + i * 22}" cy="${PHOTO.y + TITLE_BAR / 2}" r="7" fill="${fill}"/>`,
    ),
    `<text x="${PHOTO.x + PHOTO.w / 2}" y="${PHOTO.y + TITLE_BAR / 2 + 5}" text-anchor="middle" font-family="${MONO}" font-size="14" fill="#8C8CA0">${title}</text>`,
    `<g font-family="${MONO}" font-size="${fontSize}" fill="#ECECF4" style="white-space:pre">${promptLines}</g>`,
    // The caption strip
    `<text x="${PHOTO.x + 6}" y="${captionY + 92}" font-family="${HAND}" font-size="38" fill="#2B2B2B">${escapeXml(snap.date)}</text>`,
    handle === ''
      ? ''
      : `<text x="${PHOTO.x + PHOTO.w - 6}" y="${captionY + 92}" text-anchor="end" font-family="${HAND}" font-size="32" fill="#2B2B2B">${handle}</text>`,
    model === ''
      ? ''
      : `<text x="${PHOTO.x + 8}" y="${captionY + 140}" font-family="${SANS}" font-size="20" fill="#8A8580">${model}</text>`,
    `<text x="${PHOTO.x + PHOTO.w - 6}" y="${CARD.y + CARD.h - 34}" text-anchor="end" font-family="${SANS}" font-size="15" fill="#B8B2AA"><tspan fill="${theme.accent}">✳</tspan> Claude Code</text>`,
    `</g></svg>`,
  ].join('')
}
