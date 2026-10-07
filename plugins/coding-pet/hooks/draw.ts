import type { CodingPetMood, CodingPetPaneView, CodingPetRegistry, CodingPetSpecies, CodingPetStage, CodingPetState } from '../types'
import { fedStreak, stageOf, xpToNext } from './core'
import { EGG } from './registry'

const FACES: Record<CodingPetMood, string> = {
  ok: 'o.o',
  happy: '^.^',
  coding: 'ò_ó',
  sleeping: '-.-',
  hungry: 'o.O',
  tired: 'u.u',
  sad: ';.;',
}
/** The egg shows two eyes peeking out. */
const EGG_FACES: Record<CodingPetMood, string> = {
  ok: 'oo',
  happy: '^^',
  coding: '><',
  sleeping: '--',
  hungry: 'oO',
  tired: 'uu',
  sad: ';;',
}

/** A word or glyph beside the pet's head. */
export const BUBBLES: Record<CodingPetMood, string[]> = {
  ok: [''],
  happy: ['♥', ' ♥'],
  coding: ['⌨', '⌨ .', '⌨ ..', '⌨ ...'],
  sleeping: ['z', 'zZ', 'zZz'],
  hungry: ['food?', 'food?!'],
  tired: ['yawn', ''],
  sad: ['...', ''],
}

export const MOOD_LABEL: Record<CodingPetMood, string> = {
  ok: 'content',
  happy: 'happy',
  coding: 'coding with you',
  sleeping: 'asleep',
  hungry: 'hungry',
  tired: 'tired',
  sad: 'sad',
}

const STAGE_EMOJI: Record<CodingPetStage, string> = { egg: '🥚', baby: '🐣', teen: '', adult: '' }

const cells = (text: string): number => Array.from(text).length

export function speciesOf(registry: CodingPetRegistry, id: string): CodingPetSpecies {
  return registry.species.find(one => one.id === id) ?? registry.species[0] ?? { id, emoji: '?', color: '#999999', names: [id], art: {} }
}

/** The art for a stage, falling back to the nearest younger stage the species has. */
function artOf(species: CodingPetSpecies, stage: CodingPetStage): [string[], string[]] {
  if (stage === 'egg') return EGG
  const order: CodingPetStage[] = ['adult', 'teen', 'baby']
  for (const one of order.slice(order.indexOf(stage))) {
    const art = species.art[one]
    if (art !== undefined) return art
  }
  return EGG
}

/**
 * The pet's rows for this frame, all one width. It blinks now and then, and
 * bobs between its two frames: fast while coding, not at all asleep.
 */
export function spriteRows(pet: Pick<CodingPetState, 'level'>, species: CodingPetSpecies, mood: CodingPetMood, frame: number): string[] {
  const stage = stageOf(pet.level)
  const frames = artOf(species, stage)
  const isBlink = mood !== 'sleeping' && frame % 13 === 12
  const faces = stage === 'egg' ? EGG_FACES : FACES
  const face = isBlink ? (stage === 'egg' ? '--' : '-.-') : faces[mood]
  const pace = mood === 'coding' ? 1 : 2
  const which = mood === 'sleeping' ? 0 : Math.floor(frame / pace) % 2
  const rows = (which === 0 ? frames[0] : frames[1]).map(row => row.replace('{f}', face))
  const width = Math.max(...frames.flatMap(one => one.map(row => cells(row.replace('{f}', faces.ok)))))

  return rows.map(row => row + ' '.repeat(Math.max(0, width - cells(row))))
}

export function bubbleOf(mood: CodingPetMood, frame: number): string {
  const bubbles = BUBBLES[mood]
  return bubbles[Math.floor(frame / 2) % bubbles.length] ?? ''
}

/** A bar of `width` cells, filled to `value` of `max`. */
export function bar(value: number, max: number, width: number): string {
  const filled = max <= 0 ? 0 : Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Green, amber or red for a stat. */
export function statColor(value: number): string {
  if (value >= 60) return '#6CC24A'
  if (value >= 25) return '#E8B04A'
  return '#E5533D'
}

export function iconOf(pet: CodingPetState, species: CodingPetSpecies): string {
  const stage = stageOf(pet.level)
  return STAGE_EMOJI[stage] === '' ? species.emoji : STAGE_EMOJI[stage]
}

export function statusLine(pet: CodingPetState, species: CodingPetSpecies, mood: CodingPetMood): string {
  const need = mood === 'hungry' ? ' 🍖?' : mood === 'tired' ? ' 💤?' : mood === 'sad' ? ' 💧' : ''
  return `${iconOf(pet, species)} ${pet.name} Lv${pet.level} ♥${Math.round(pet.stats.happiness)}${need}`
}

const ageOf = (pet: CodingPetState, now: number): string => {
  const days = Math.floor((now - pet.born) / 86_400_000)
  return days === 0 ? 'hatched today' : days === 1 ? '1 day old' : `${days} days old`
}

/** The whole pet as text, for `/codepet stats` and the model's tool. */
export function describe(pet: CodingPetState, registry: CodingPetRegistry, mood: CodingPetMood, now: number): string {
  const species = speciesOf(registry, pet.species)
  const stage = stageOf(pet.level)
  const today = Object.entries(pet.today.xp)
    .filter(([, xp]) => xp > 0)
    .map(([kind, xp]) => `${labelOf(registry, kind)} +${xp}`)
    .join(', ')
  const earned = registry.achievements.filter(one => pet.achievements.includes(one.id))
  const s = pet.stats

  return [
    `${iconOf(pet, species)} ${pet.name} the ${species.id} (${stage}), level ${pet.level}, ${ageOf(pet, now)}, ${MOOD_LABEL[mood]}.`,
    `XP ${Math.floor(pet.xp)}/${xpToNext(pet.level)} to level ${pet.level + 1} (${Math.floor(pet.totalXp)} total).`,
    `Happiness ${Math.round(s.happiness)}, energy ${Math.round(s.energy)}, fullness ${Math.round(s.fullness)}.`,
    `Today: ${today === '' ? 'no XP yet' : today}.`,
    `Achievements: ${earned.length === 0 ? 'none yet' : earned.map(one => `${one.emoji} ${one.title}`).join(', ')}.`,
    fedStreak(pet.fedDays, now) > 1 ? `Fed ${fedStreak(pet.fedDays, now)} days in a row.` : '',
  ]
    .filter(line => line !== '')
    .join('\n')
}

export function labelOf(registry: CodingPetRegistry, kind: string): string {
  return registry.activities.find(one => one.kind === kind)?.label ?? kind
}

export const HELP =
  'Try /codepet (the pane), /codepet feed [apple|pizza|coffee|cookie], /codepet play, /codepet rest, /codepet stats, /codepet name <name>, /codepet species <blob|cat|crab>, /codepet close (the panel and strip), /codepet show, /codepet hide (silent too), /codepet reset.'

/** What the panel shows for a pet in a mood: numbers rounded as drawn, lists as listed. */
export function paneViewOf(pet: CodingPetState, registry: CodingPetRegistry, mood: CodingPetMood): CodingPetPaneView {
  return {
    name: pet.name,
    species: speciesOf(registry, pet.species).id,
    stage: stageOf(pet.level),
    mood,
    level: pet.level,
    xp: Math.floor(pet.xp),
    xpToNext: xpToNext(pet.level),
    totalXp: Math.floor(pet.totalXp),
    stats: {
      happiness: Math.round(pet.stats.happiness),
      energy: Math.round(pet.stats.energy),
      fullness: Math.round(pet.stats.fullness),
    },
    today: Object.entries(pet.today.xp)
      .filter(([, xp]) => xp > 0)
      .map(([kind, xp]) => ({ label: labelOf(registry, kind), xp })),
    totals: Object.entries(pet.totals)
      .filter(([kind]) => kind !== 'toolFail')
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([kind, count]) => ({ label: labelOf(registry, kind), count })),
    achievements: registry.achievements.map(one => ({
      id: one.id,
      title: one.title,
      emoji: one.emoji,
      description: one.description,
      isEarned: pet.achievements.includes(one.id),
    })),
    foods: registry.foods.map(food => ({ id: food.id, emoji: food.emoji })),
  }
}

/** Whether two panel views draw the same. */
export const isSameView = (a: CodingPetPaneView | null, b: CodingPetPaneView | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
