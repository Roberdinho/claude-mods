import type { CodingPetMood, CodingPetSpecies, CodingPetStage } from '../types'
import { MOOD_LABEL } from './draw'

/** Escapes text for SVG. */
const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const SIZE: Record<CodingPetStage, number> = { egg: 0.8, baby: 0.75, teen: 0.9, adult: 1 }


/** Eyes for a mood, centred on (0, 0) of the face; `blink` animates the open ones. */
function eyes(mood: CodingPetMood, spread: number, ink: string): string {
  const pair = (draw: (x: number) => string): string => draw(-spread) + draw(spread)
  const blink = '<animate attributeName="ry" values="5;5;0.6;5" keyTimes="0;0.92;0.96;1" dur="4s" repeatCount="indefinite"/>'
  switch (mood) {
    case 'happy':
      return pair(x => `<path d="M${x - 5} 2 Q${x} -6 ${x + 5} 2" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`)
    case 'sleeping':
    case 'tired':
      return pair(x => `<path d="M${x - 5} ${mood === 'tired' ? 1 : 0} L${x + 5} ${mood === 'tired' ? 1 : 0}" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>`)
    case 'sad':
      return (
        pair(x => `<ellipse cx="${x}" cy="0" rx="3.5" ry="4.5" fill="${ink}"/>`) +
        `<path d="M${spread + 2} 6 q2 5 0 8 q-2 -3 0 -8" fill="#6EC6FF"><animate attributeName="opacity" values="1;0;1" dur="2.4s" repeatCount="indefinite"/></path>`
      )
    case 'hungry':
      return `<ellipse cx="${-spread}" cy="0" rx="3.5" ry="4.5" fill="${ink}"/><ellipse cx="${spread}" cy="0" rx="5" ry="6" fill="${ink}"/>`
    case 'coding':
      return pair(x => `<ellipse cx="${x}" cy="1" rx="4" ry="3" fill="${ink}"/>`)
    default:
      return pair(x => `<ellipse cx="${x}" cy="0" rx="4" ry="5" fill="${ink}">${blink}</ellipse><circle cx="${x + 1.5}" cy="-2" r="1.3" fill="#fff"/>`)
  }
}

function mouth(mood: CodingPetMood, ink: string): string {
  switch (mood) {
    case 'happy':
      return `<path d="M-7 10 Q0 18 7 10" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    case 'sad':
    case 'hungry':
      return `<path d="M-6 15 Q0 9 6 15" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    case 'sleeping':
      return `<ellipse cx="0" cy="12" rx="3" ry="2" fill="${ink}"/>`
    default:
      return `<path d="M-5 11 Q0 15 5 11" stroke="${ink}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
  }
}

/** The pet's body for its species, centred on (0, 0), about 120 wide at full size. */
function body(species: CodingPetSpecies, stage: CodingPetStage, mood: CodingPetMood): string {
  const ink = '#2B2B2B'
  const c = species.color
  const face = (y: number, spread: number): string => `<g transform="translate(0 ${y})">${eyes(mood, spread, ink)}${mouth(mood, ink)}</g>`

  if (stage === 'egg') {
    return (
      `<path d="M0 -62 C34 -62 48 -10 48 18 C48 48 26 62 0 62 C-26 62 -48 48 -48 18 C-48 -10 -34 -62 0 -62 Z" fill="#F4EBDD" stroke="#D9C9B0" stroke-width="3"/>` +
      `<circle cx="-22" cy="30" r="7" fill="${c}" opacity="0.45"/><circle cx="20" cy="-18" r="5" fill="${c}" opacity="0.45"/><circle cx="24" cy="36" r="4" fill="${c}" opacity="0.45"/>` +
      `<path d="M-30 -2 L-18 -12 L-6 -2 L6 -12 L18 -2 L30 -12" stroke="#BFAE92" stroke-width="2.5" fill="none" stroke-linejoin="round"/>` +
      `<g transform="translate(0 6)">${eyes(mood, 11, ink)}</g>`
    )
  }

  switch (species.id) {
    case 'cat':
      return (
        `<path d="M58 30 q30 -6 26 -40" stroke="${c}" stroke-width="10" fill="none" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="-6 58 30;8 58 30;-6 58 30" dur="1.8s" repeatCount="indefinite"/></path>` +
        `<ellipse cx="0" cy="26" rx="52" ry="38" fill="${c}"/>` +
        `<path d="M-46 -40 L-38 -78 L-14 -52 Z M46 -40 L38 -78 L14 -52 Z" fill="${c}"/>` +
        `<path d="M-38 -48 L-36 -66 L-24 -52 Z M38 -48 L36 -66 L24 -52 Z" fill="#F7B2B7"/>` +
        `<circle cx="0" cy="-22" r="46" fill="${c}"/>` +
        `<path d="M-30 -10 L-52 -14 M-30 -4 L-52 -2 M30 -10 L52 -14 M30 -4 L52 -2" stroke="${ink}" stroke-width="1.5" opacity="0.5"/>` +
        `<ellipse cx="-20" cy="60" rx="12" ry="7" fill="${c}"/><ellipse cx="20" cy="60" rx="12" ry="7" fill="${c}"/>` +
        face(-24, 16)
      )
    case 'crab': {
      const claw = (side: 1 | -1): string =>
        `<g transform="translate(${side * 62} -20)"><path d="M0 0 C${side * 10} -14 ${side * 26} -16 ${side * 26} -2 L${side * 12} -2 L${side * 22} 10 C${side * 12} 20 0 14 0 0 Z" fill="${c}">` +
        `<animateTransform attributeName="transform" type="rotate" values="0;${side * -12};0" dur="1.2s" repeatCount="indefinite"/></path></g>`
      return (
        claw(-1) +
        claw(1) +
        `<path d="M-48 -4 L-62 -20 M48 -4 L62 -20" stroke="${c}" stroke-width="8" stroke-linecap="round"/>` +
        `<path d="M-40 30 L-58 52 M-28 36 L-40 60 M40 30 L58 52 M28 36 L40 60" stroke="${c}" stroke-width="7" stroke-linecap="round"/>` +
        `<ellipse cx="0" cy="10" rx="56" ry="36" fill="${c}"/>` +
        `<path d="M-12 -24 L-14 -44 M12 -24 L14 -44" stroke="${c}" stroke-width="5" stroke-linecap="round"/>` +
        `<circle cx="-14" cy="-46" r="9" fill="#fff"/><circle cx="14" cy="-46" r="9" fill="#fff"/>` +
        `<g transform="translate(0 -46)">${eyes(mood, 14, ink)}</g>` +
        `<g transform="translate(0 2)">${mouth(mood, ink)}</g>`
      )
    }
    default:
      return (
        `<path d="M0 -58 C40 -58 60 -20 60 20 C60 50 40 62 0 62 C-40 62 -60 50 -60 20 C-60 -20 -40 -58 0 -58 Z" fill="${c}">` +
        `<animate attributeName="d" dur="2.4s" repeatCount="indefinite" values="M0 -58 C40 -58 60 -20 60 20 C60 50 40 62 0 62 C-40 62 -60 50 -60 20 C-60 -20 -40 -58 0 -58 Z;M0 -52 C44 -52 64 -16 64 22 C64 50 42 62 0 62 C-42 62 -64 50 -64 22 C-64 -16 -44 -52 0 -52 Z;M0 -58 C40 -58 60 -20 60 20 C60 50 40 62 0 62 C-40 62 -60 50 -60 20 C-60 -20 -40 -58 0 -58 Z"/></path>` +
        `<ellipse cx="-24" cy="-30" rx="10" ry="6" fill="#fff" opacity="0.35"/>` +
        (stage === 'adult' ? `<path d="M-22 -56 L-14 -76 L0 -62 L14 -76 L22 -56 Z" fill="#F5C542" stroke="#C99A1E" stroke-width="2"/>` : '') +
        face(0, 18)
      )
  }
}

/** A word or glyph beside the pet's head, drifting up. */
function bubble(mood: CodingPetMood): string {
  const float = '<animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" dur="2.6s" repeatCount="indefinite"/>'
  switch (mood) {
    case 'sleeping':
      return `<g font-weight="700" fill="#8EA4D2"><text x="64" y="-50" font-size="18">z${float}</text><text x="80" y="-70" font-size="24">Z${float}</text></g>`
    case 'happy':
      return `<text x="66" y="-56" font-size="26" fill="#F06292">♥${float}</text>`
    case 'hungry':
      return `<g>${float}<rect x="50" y="-90" width="66" height="28" rx="14" fill="#FFF3E0" stroke="#E8A33A"/><text x="83" y="-71" font-size="14" text-anchor="middle" fill="#9A5B00">food?</text></g>`
    case 'tired':
      return `<text x="64" y="-56" font-size="16" fill="#8EA4D2">yawn${float}</text>`
    case 'coding':
      return `<g transform="translate(-26 44)"><rect x="0" y="0" width="52" height="30" rx="3" fill="#3A3F4B"/><rect x="4" y="4" width="44" height="22" fill="#9FE6A0" opacity="0.85"><animate attributeName="opacity" values="0.85;0.5;0.85" dur="0.9s" repeatCount="indefinite"/></rect><rect x="-6" y="30" width="64" height="5" rx="2" fill="#2B2F38"/></g>`
    default:
      return ''
  }
}


const STYLE =
  '<style>.sky{fill:#F3F7FB}.ground{fill:#E4EEDD}' +
  '@media (prefers-color-scheme: dark){.sky{fill:#2E3238}.ground{fill:#2F3A2C}}</style>'

/** The picture's size in CSS pixels. */
export const SCENE = { width: 200, height: 180 }

/**
 * The pet itself, animated: it bounces, blinks and dozes by itself. It depends
 * on the species, the stage and the mood alone, so XP and stats changing never
 * redraw it (a new source reloads the animation).
 */
export function petScene(species: CodingPetSpecies, stage: CodingPetStage, mood: CodingPetMood): string {
  const { width, height } = SCENE
  const scale = SIZE[stage] * 0.82
  const bounce = mood === 'sleeping' ? '0 0;0 2;0 0' : mood === 'coding' ? '0 0;0 -4;0 0' : '0 0;0 -8;0 0'
  const pace = mood === 'sleeping' ? '3.2s' : mood === 'coding' ? '0.5s' : '1.4s'

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif">`,
    STYLE,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" class="sky"/>`,
    `<ellipse cx="${width / 2}" cy="${height - 22}" rx="${width / 2 - 16}" ry="12" class="ground"/>`,
    `<ellipse cx="${width / 2}" cy="${height - 28}" rx="${50 * scale}" ry="7" fill="#000" opacity="0.12"/>`,
    `<g transform="translate(${width / 2 - 8} ${height - 32 - 62 * scale})"><g>`,
    `<animateTransform attributeName="transform" type="translate" values="${bounce}" dur="${pace}" repeatCount="indefinite"/>`,
    `<g transform="scale(${scale})">${body(species, stage, mood)}${bubble(mood)}</g>`,
    '</g></g>',
    '</svg>',
  ].join('')
}
