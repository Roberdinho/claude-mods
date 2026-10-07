import type { Actor, Mood, Pet, Scene, Species } from '../types'

export const SPECIES: readonly Species[] = ['clawd', 'cat', 'dog', 'crab', 'fox', 'duck', 'rabbit', 'snake']
export const MAX_PETS = 8
/** Milliseconds per tick of the playground. */
export const TICK_MS = 250

type Face = 'normal' | 'blink' | 'happy' | 'sad' | 'sleep' | 'alert'

type Sprite = {
  /** Two walk frames, facing right, rows top to bottom; `{f}` is the face. */
  frames: [string[], string[]]
  faces: Record<Face, string>
  color: string
}

const EYES: Record<Face, string> = {
  normal: 'o.o',
  blink: '-.-',
  happy: '^.^',
  sad: ';.;',
  sleep: '-.-',
  alert: 'O.O',
}
const EYE: Record<Face, string> = { normal: 'o', blink: '-', happy: '^', sad: ';', sleep: '-', alert: 'O' }

const SPRITES: Record<Species, Sprite> = {
  clawd: {
    frames: [
      [' ▐▛███▜▌', '▝▜█████▛▘', '  ▘▘ ▝▝'],
      [' ▐▛███▜▌', '▝▜█████▛▘', '  ▝▝ ▘▘'],
    ],
    faces: EYES,
    color: '#D97757',
  },
  cat: {
    frames: [
      ['  /\\_/\\', ' ( {f} )', '~ (")(")'],
      ['  /\\_/\\', ' ( {f} )', '_ (") (")'],
    ],
    faces: EYES,
    color: '#E8B04A',
  },
  dog: {
    frames: [
      ['   ___', ' U( {f} )U', '~  (_)(_)'],
      ['   ___', ' U( {f} )U', '/  (_) (_)'],
    ],
    faces: EYES,
    color: '#B5835A',
  },
  crab: {
    frames: [
      ['(\\/)({f})(\\/)', '   //   \\\\'],
      ['(\\/)({f})(\\/)', '   \\\\   //'],
    ],
    faces: { normal: 'o,o', blink: '-,-', happy: '^,^', sad: ';,;', sleep: '-,-', alert: 'O,O' },
    color: '#E5533D',
  },
  fox: {
    frames: [
      ['  /\\   /\\', '  \\ {f} /', '~~ \\_v_/'],
      ['  /\\   /\\', '  \\ {f} /', '~  \\_v_/'],
    ],
    faces: EYES,
    color: '#EE7E2F',
  },
  duck: {
    frames: [
      ['   __', '_( {f}>', '\\___)'],
      ['   __', '_( {f}>', '\\__/)'],
    ],
    faces: EYE,
    color: '#F2C94C',
  },
  rabbit: {
    frames: [
      ['  (\\(\\', '  ( {f})', 'o(")(")'],
      ['  (\\(\\', '  ( {f})', 'o (")(")'],
    ],
    faces: EYES,
    color: '#D8D8D8',
  },
  snake: {
    frames: [['_/\\_/\\_({f}>'], ['\\_/\\_/\\({f}>']],
    faces: EYE,
    color: '#6CC24A',
  },
}

const NAMES: Record<Species, string[]> = {
  clawd: ['Clawd', 'Clawdette', 'Clawdius'],
  cat: ['Whiskers', 'Luna', 'Miso', 'Mittens'],
  dog: ['Biscuit', 'Rex', 'Bolt', 'Pixel'],
  crab: ['Ferris', 'Pinchy', 'Clacks'],
  fox: ['Rusty', 'Kit', 'Ember'],
  duck: ['Rubber Duck', 'Quackers', 'Debug'],
  rabbit: ['Clover', 'Bun', 'Hops'],
  snake: ['Monty', 'Sly', 'Py'],
}

const MIRROR: Record<string, string> = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<',
  '/': '\\', '\\': '/', '▐': '▌', '▌': '▐', '▛': '▜', '▜': '▛', '▝': '▘', '▘': '▝',
}

const cells = (text: string): string[] => Array.from(text)

/** The rows of a pet as drawn: padded to one width, mirrored when it faces left. */
export function spriteRows(species: Species, frame: number, face: Face, dir: 1 | -1): string[] {
  const sprite = SPRITES[species]
  const rows = sprite.frames[frame % 2 === 0 ? 0 : 1].map(row => row.replace('{f}', sprite.faces[face]))
  const width = spriteWidth(species)
  const padded = rows.map(row => row + ' '.repeat(width - cells(row).length))
  if (dir === 1) return padded

  return padded.map(row => cells(row).reverse().map(c => MIRROR[c] ?? c).join(''))
}

/** The widest row over both frames, so a pet never jitters between them. */
export function spriteWidth(species: Species): number {
  const sprite = SPRITES[species]
  let width = 0
  for (const frame of sprite.frames) {
    for (const row of frame) width = Math.max(width, cells(row.replace('{f}', sprite.faces.normal)).length)
  }

  return width
}

export const colorOf = (species: Species): string => SPRITES[species].color

function faceOf(actor: Actor, tick: number): Face {
  switch (actor.mood) {
    case 'sleep':
      return 'sleep'
    case 'happy':
      return 'happy'
    case 'sad':
      return 'sad'
    case 'chase':
      return 'alert'
    default:
      return (tick + actor.id.length * 7) % 23 === 0 ? 'blink' : 'normal'
  }
}

// ---------------------------------------------------------------- randomness

/** mulberry32: a small seeded generator, so a step is a pure function of its scene. */
function nextRandom(seed: number): [number, number] {
  const s = (seed + 0x6d2b79f5) | 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s]
}

class Dice {
  constructor(public seed: number) {}
  next(): number {
    const [value, seed] = nextRandom(this.seed)
    this.seed = seed
    return value
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }
}

// ---------------------------------------------------------------- the pets themselves

export function emptyScene(seed: number): Scene {
  return { tick: 0, seed: seed | 0, lastActive: 0, actors: [], ball: null }
}

export function defaultPets(): Pet[] {
  return [{ id: 'clawd-1', name: 'Clawd', species: 'clawd' }]
}

/** A name for a new pet of this kind that none of the others has. */
export function nameFor(species: Species, pets: readonly Pet[]): string {
  const taken = new Set(pets.map(pet => pet.name.toLowerCase()))
  const free = NAMES[species].find(name => !taken.has(name.toLowerCase()))
  if (free !== undefined) return free
  const base = NAMES[species][0] ?? species
  let n = 2
  while (taken.has(`${base} ${n}`.toLowerCase())) n += 1

  return `${base} ${n}`
}

export function addPet(pets: readonly Pet[], species: Species, name?: string): Pet[] {
  let n = 1
  while (pets.some(pet => pet.id === `${species}-${n}`)) n += 1
  const given = name?.trim()

  return [...pets, { id: `${species}-${n}`, name: given !== undefined && given !== '' ? given : nameFor(species, pets), species }]
}

/** The pet a name, id or species points at: exact name first, then id, then the last of a species. */
export function findPet(pets: readonly Pet[], who: string): Pet | undefined {
  const want = who.trim().toLowerCase()
  return (
    pets.find(pet => pet.name.toLowerCase() === want) ??
    pets.find(pet => pet.id === want) ??
    [...pets].reverse().find(pet => pet.species === want)
  )
}

function newActor(pet: Pet, width: number, dice: Dice): Actor {
  const room = Math.max(0, width - spriteWidth(pet.species))
  return { id: pet.id, x: dice.int(0, room), dir: dice.next() < 0.5 ? 1 : -1, mood: 'walk', ticks: dice.int(8, 24), frame: 0, bubble: '' }
}

function nextMood(actor: Actor, isDrowsy: boolean, dice: Dice): Actor {
  if (isDrowsy) return { ...actor, mood: 'sleep', ticks: dice.int(40, 80), bubble: 'z' }
  const roll = dice.next()
  if (roll < 0.5) return { ...actor, mood: 'walk', ticks: dice.int(10, 40), bubble: '' }
  if (roll < 0.7) return { ...actor, mood: 'sit', ticks: dice.int(10, 30), bubble: '' }
  if (roll < 0.82) return { ...actor, mood: 'run', ticks: dice.int(6, 16), bubble: '' }
  return { ...actor, mood: 'walk', dir: actor.dir === 1 ? -1 : 1, ticks: dice.int(8, 24), bubble: '' }
}

/** Moves by `by` cells, turning around at either edge. */
function walk(actor: Actor, by: number, room: number): Actor {
  let x = actor.x + actor.dir * by
  let dir = actor.dir
  if (x <= 0) {
    x = 0
    dir = 1
  } else if (x >= room) {
    x = room
    dir = -1
  }

  return { ...actor, x, dir, frame: actor.frame + 1 }
}

export type StepOptions = {
  /** Ticks without a prompt or turn before pets curl up and sleep; 0 never. */
  sleepAfter: number
}

/** One tick of the playground, `width` cells wide. */
export function step(scene: Scene, pets: readonly Pet[], width: number, options: StepOptions): Scene {
  const dice = new Dice(scene.seed)
  const tick = scene.tick + 1
  const isDrowsy = options.sleepAfter > 0 && tick - scene.lastActive > options.sleepAfter

  // Keep one actor per pet, in the pets' order.
  const actors = pets.map(pet => scene.actors.find(actor => actor.id === pet.id) ?? newActor(pet, width, dice))

  let ball = scene.ball
  if (ball !== null) {
    let x = ball.x + ball.vx
    let vx = ball.vx * 0.85
    if (x < 0 || x > width - 1) {
      x = Math.max(0, Math.min(width - 1, x))
      vx = -vx
    }
    ball = { x, vx: Math.abs(vx) < 0.15 ? 0 : vx }
  }

  const moved = actors.map((actor, i) => {
    const pet = pets[i]
    if (pet === undefined) return actor
    const w = spriteWidth(pet.species)
    const room = Math.max(0, width - w)
    let next: Actor = { ...actor, x: Math.min(actor.x, room), ticks: actor.ticks - 1 }

    const isBusy = next.mood === 'happy' || next.mood === 'sad'
    if (ball !== null && !isBusy && next.mood !== 'sleep') {
      const middle = next.x + Math.floor(w / 2)
      const target = Math.round(ball.x)
      if (Math.abs(middle - target) <= 1) {
        ball = null
        return { ...next, mood: 'happy' as Mood, ticks: 12, bubble: '♥', frame: 0 }
      }
      next = { ...next, mood: 'chase', dir: target > middle ? 1 : -1, bubble: '!' }
      return walk(next, 1, room)
    }
    if (next.mood === 'chase') next = { ...next, ticks: 0 }

    if (next.ticks <= 0) next = nextMood(next, isDrowsy, dice)
    if (next.mood === 'sleep' && !isDrowsy) next = nextMood(next, false, dice)

    switch (next.mood) {
      case 'walk':
        return tick % 2 === 0 ? walk(next, 1, room) : next
      case 'run':
        return walk(next, 1, room)
      case 'sleep':
        return { ...next, frame: 0, bubble: Math.floor(tick / 6) % 2 === 0 ? 'z' : 'zZ' }
      case 'happy':
        return { ...next, frame: tick % 4 < 2 ? 0 : 1 }
      default:
        return next
    }
  })

  return { tick, seed: dice.seed, lastActive: scene.lastActive, actors: moved, ball }
}

/** Throws a ball from one edge or the other; the pets chase it. */
export function throwBall(scene: Scene, width: number): Scene {
  const dice = new Dice(scene.seed)
  const fromLeft = dice.next() < 0.5
  const speed = 2 + dice.next() * 1.5

  return {
    ...scene,
    seed: dice.seed,
    lastActive: scene.tick,
    ball: { x: fromLeft ? 0 : Math.max(0, width - 1), vx: fromLeft ? speed : -speed },
    actors: scene.actors.map(actor => (actor.mood === 'sleep' ? { ...actor, mood: 'sit', ticks: 0, bubble: '' } : actor)),
  }
}

/** Something happened: sleeping pets wake up and the idle clock starts over. */
export function wake(scene: Scene): Scene {
  return {
    ...scene,
    lastActive: scene.tick,
    actors: scene.actors.map(actor => (actor.mood === 'sleep' ? { ...actor, mood: 'sit', ticks: 4, bubble: '' } : actor)),
  }
}

/** One pet reacts: `happy` with a heart (a turn finished), `sad` with a `!` (a tool failed). */
export function react(scene: Scene, mood: 'happy' | 'sad'): Scene {
  const dice = new Dice(scene.seed)
  const awake = scene.actors.filter(actor => actor.mood !== 'happy' && actor.mood !== 'sad' && actor.mood !== 'chase')
  if (awake.length === 0) return { ...scene, seed: dice.seed }
  const chosen = awake[dice.int(0, awake.length - 1)]

  return {
    ...scene,
    seed: dice.seed,
    actors: scene.actors.map(actor =>
      actor === chosen ? { ...actor, mood, ticks: mood === 'happy' ? 12 : 10, frame: 0, bubble: mood === 'happy' ? '♥' : '!' } : actor,
    ),
  }
}

// ---------------------------------------------------------------- drawing

export type Run = { text: string; color?: string }

/** The playground as rows of colored runs, `width` cells wide. */
export function drawScene(scene: Scene, pets: readonly Pet[], width: number): Run[][] {
  const tall = Math.max(2, ...pets.map(pet => SPRITES[pet.species].frames[0].length))
  const grid: { ch: string; color?: string }[][] = Array.from({ length: tall }, () =>
    Array.from({ length: width }, () => ({ ch: ' ' })),
  )
  const put = (row: number, col: number, ch: string, color?: string): void => {
    const line = grid[row]
    if (line === undefined || col < 0 || col >= width || ch === ' ') return
    line[col] = { ch, color }
  }

  if (scene.ball !== null) put(tall - 1, Math.round(scene.ball.x), '●', '#C6E03A')

  scene.actors.forEach(actor => {
    const pet = pets.find(one => one.id === actor.id)
    if (pet === undefined) return
    const rows = spriteRows(pet.species, actor.frame, faceOf(actor, scene.tick), actor.dir)
    const w = spriteWidth(pet.species)
    const x = Math.max(0, Math.min(actor.x, width - w))
    const top = tall - rows.length
    const color = colorOf(pet.species)
    rows.forEach((row, r) => cells(row).forEach((ch, c) => put(top + r, x + c, ch, color)))
    if (actor.bubble !== '') {
      const bubble = cells(actor.bubble)
      const at = actor.dir === 1 ? x + w : x - bubble.length
      bubble.forEach((ch, i) => put(top, at + i, ch, actor.mood === 'sad' ? '#E5533D' : '#F28CB1'))
    }
  })

  return grid.map(line => {
    const runs: Run[] = []
    for (const cell of line) {
      const last = runs[runs.length - 1]
      if (last !== undefined && last.color === cell.color) last.text += cell.ch
      else runs.push(cell.color === undefined ? { text: cell.ch } : { text: cell.ch, color: cell.color })
    }
    return runs
  })
}

// ---------------------------------------------------------------- the /pet command

export type PetCommand =
  | { kind: 'add'; species: Species; name?: string }
  | { kind: 'remove'; who: string }
  | { kind: 'rename'; who: string; name: string }
  | { kind: 'ball' }
  | { kind: 'list' }
  | { kind: 'hide' }
  | { kind: 'show' }
  | { kind: 'help' }
  | { kind: 'error'; text: string }

const SPECIES_ALIASES: Record<string, Species> = { claude: 'clawd', kitten: 'cat', puppy: 'dog', ferris: 'crab', bunny: 'rabbit' }

export function speciesOf(word: string): Species | undefined {
  const lower = word.trim().toLowerCase().replace(/s$/, '')
  return SPECIES.find(one => one === lower) ?? SPECIES_ALIASES[lower] ?? SPECIES.find(one => one === word.trim().toLowerCase())
}

export function parseCommand(args: string): PetCommand {
  const [first = '', ...rest] = args.trim().split(/\s+/)
  const word = first.toLowerCase()
  const tail = rest.join(' ').trim()
  switch (word) {
    case '':
    case 'help':
      return { kind: 'help' }
    case 'add':
    case 'new':
    case 'spawn': {
      const [kind = '', ...name] = rest
      const species = speciesOf(kind)
      if (species === undefined) return { kind: 'error', text: `Pick a kind of pet: ${SPECIES.join(', ')}.` }
      const given = name.join(' ').trim()
      return given === '' ? { kind: 'add', species } : { kind: 'add', species, name: given }
    }
    case 'remove':
    case 'rm':
    case 'bye':
      return tail === '' ? { kind: 'error', text: 'Say which pet: /pet remove <name>.' } : { kind: 'remove', who: tail }
    case 'rename': {
      const [who = '', ...name] = rest
      const given = name.join(' ').trim()
      return who === '' || given === '' ? { kind: 'error', text: 'Say which pet and its new name: /pet rename <pet> <name>.' } : { kind: 'rename', who, name: given }
    }
    case 'ball':
    case 'throw':
      return { kind: 'ball' }
    case 'list':
    case 'ls':
      return { kind: 'list' }
    case 'hide':
      return { kind: 'hide' }
    case 'show':
      return { kind: 'show' }
    default: {
      // `/pet cat` adds a cat.
      const species = speciesOf(first)
      if (species !== undefined) return tail === '' ? { kind: 'add', species } : { kind: 'add', species, name: tail }
      return { kind: 'error', text: `Unknown "${first}". ${HELP}` }
    }
  }
}

export const HELP = `Try /pet add <${SPECIES.join(' | ')}> [name], /pet ball, /pet list, /pet rename <pet> <name>, /pet remove <pet>, /pet hide, /pet show.`

const ICON: Record<Species, string> = { clawd: '✻', cat: '🐈', dog: '🐕', crab: '🦀', fox: '🦊', duck: '🦆', rabbit: '🐇', snake: '🐍' }

export function describePets(pets: readonly Pet[]): string {
  if (pets.length === 0) return 'No pets yet. Add one: /pet add cat'
  return pets.map(pet => `${ICON[pet.species]} ${pet.name} (${pet.species})`).join('\n')
}
