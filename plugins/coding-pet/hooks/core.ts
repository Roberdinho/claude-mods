import type {
  CodingPetAction,
  CodingPetEffect,
  CodingPetMood,
  CodingPetRegistry,
  CodingPetStage,
  CodingPetStatDelta,
  CodingPetState,
  CodingPetStats,
  CodingPetView,
} from '../types'
import { STAGES } from './registry'

export const SCHEMA_VERSION = 1
const HOUR = 3_600_000
/** A pet left alone longer than this decays no further. */
const MAX_DECAY_MS = 7 * 24 * HOUR
const REST_MS = 20 * 60_000
/** The most XP one grant from another plugin may give. */
export const MAX_GRANT = 50
/** The default cooldown of an activity only another plugin knows. */
const AWARD_COOLDOWN_MS = 1_000

export type Difficulty = 'chill' | 'normal' | 'hardcore'
const DECAY: Record<Difficulty, number> = { chill: 0.5, normal: 1, hardcore: 2 }

export type Settings = { difficulty: Difficulty }

// ---------------------------------------------------------------- levels and stages

/** XP it takes to go from `level` to the next. */
export const xpToNext = (level: number): number => Math.round(50 * Math.pow(level, 1.5))

export function stageOf(level: number): CodingPetStage {
  let stage: CodingPetStage = 'egg'
  for (const one of STAGES) if (level >= one.level) stage = one.stage
  return stage
}

// ---------------------------------------------------------------- dates

const pad = (n: number): string => String(n).padStart(2, '0')

/** The local date of `ms`, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Days in a row, ending today or yesterday, the pet was fed. */
export function fedStreak(fedDays: readonly string[], now: number): number {
  const fed = new Set(fedDays)
  let day = now
  if (!fed.has(dayOf(day))) day -= 24 * HOUR
  let streak = 0
  while (fed.has(dayOf(day))) {
    streak += 1
    day -= 24 * HOUR
  }
  return streak
}

// ---------------------------------------------------------------- the pet

const clamp = (n: number, low = 0, high = 100): number => Math.max(low, Math.min(high, Math.round(n * 10) / 10))

export function newPet(name: string, species: string, now: number): CodingPetState {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    species,
    level: 1,
    xp: 0,
    totalXp: 0,
    stats: { happiness: 70, energy: 80, fullness: 70 },
    born: now,
    lastUpdated: now,
    sleepingUntil: 0,
    totals: {},
    today: { date: dayOf(now), xp: {} },
    lastGrant: {},
    fedDays: [],
    achievements: [],
    configured: { name, species },
  }
}

/** A stored pet brought to this version, or null when it is not a pet. */
export function migrate(stored: unknown, now: number): CodingPetState | null {
  if (typeof stored !== 'object' || stored === null) return null
  const old = stored as Partial<CodingPetState>
  if (typeof old.name !== 'string' || typeof old.species !== 'string') return null
  const fresh = newPet(old.name, old.species, now)

  return {
    ...fresh,
    ...old,
    stats: { ...fresh.stats, ...old.stats },
    today: old.today ?? fresh.today,
    configured: old.configured ?? fresh.configured,
    schemaVersion: SCHEMA_VERSION,
  }
}

export function applyDelta(stats: CodingPetStats, delta: CodingPetStatDelta | undefined): CodingPetStats {
  if (delta === undefined) return stats
  return {
    happiness: clamp(stats.happiness + (delta.happiness ?? 0)),
    energy: clamp(stats.energy + (delta.energy ?? 0)),
    fullness: clamp(stats.fullness + (delta.fullness ?? 0)),
  }
}

/**
 * The pet with the time since `lastUpdated` taken into account: it gets
 * hungrier, gets its energy back (faster asleep), and its happiness sinks
 * while it is hungry. It never drops below a floor: a neglected pet sulks,
 * it does not die.
 */
export function decay(pet: CodingPetState, now: number, settings: Settings): CodingPetState {
  const elapsed = Math.min(MAX_DECAY_MS, Math.max(0, now - pet.lastUpdated))
  if (elapsed === 0) return pet
  const hours = elapsed / HOUR
  const rate = DECAY[settings.difficulty]
  const asleepMs = Math.max(0, Math.min(now, pet.sleepingUntil) - pet.lastUpdated)
  const asleep = Math.min(hours, asleepMs / HOUR)
  const isStarving = pet.stats.fullness < 20

  const stats: CodingPetStats = {
    fullness: Math.max(0, clamp(pet.stats.fullness - 6 * rate * hours)),
    energy: clamp(pet.stats.energy + 6 * (hours - asleep) + 60 * asleep),
    happiness: Math.max(5, clamp(pet.stats.happiness - (isStarving ? 6 : 2) * rate * hours)),
  }

  return { ...pet, stats, lastUpdated: now, sleepingUntil: pet.sleepingUntil > now ? pet.sleepingUntil : 0 }
}

export function moodOf(pet: CodingPetState, now: number, isBusy: boolean): CodingPetMood {
  if (pet.sleepingUntil > now) return 'sleeping'
  if (isBusy) return 'coding'
  if (pet.stats.fullness < 20) return 'hungry'
  if (pet.stats.energy < 25) return 'tired'
  if (pet.stats.happiness < 25) return 'sad'
  if (pet.stats.happiness >= 80) return 'happy'
  return 'ok'
}

/** What the pet needs, most pressing first. */
export function needsOf(pet: CodingPetState): ('hungry' | 'tired' | 'sad')[] {
  const needs: ('hungry' | 'tired' | 'sad')[] = []
  if (pet.stats.fullness < 20) needs.push('hungry')
  if (pet.stats.energy < 20) needs.push('tired')
  if (pet.stats.happiness < 25) needs.push('sad')
  return needs
}

export function viewOf(pet: CodingPetState, now: number, isBusy: boolean): CodingPetView {
  return {
    name: pet.name,
    species: pet.species,
    stage: stageOf(pet.level),
    level: pet.level,
    xp: pet.xp,
    xpToNext: xpToNext(pet.level),
    totalXp: pet.totalXp,
    stats: pet.stats,
    mood: moodOf(pet, now, isBusy),
    achievements: pet.achievements,
  }
}

// ---------------------------------------------------------------- the reducer

export type Reduced = { pet: CodingPetState; effects: CodingPetEffect[] }

const count = (totals: Record<string, number>, kind: string): Record<string, number> => ({ ...totals, [kind]: (totals[kind] ?? 0) + 1 })

/** Adds XP, levelling up (and growing) as often as it takes. */
function gainXp(pet: CodingPetState, activity: string, xp: number, now: number, effects: CodingPetEffect[]): CodingPetState {
  if (xp <= 0) return pet
  const date = dayOf(now)
  const today = pet.today.date === date ? pet.today : { date, xp: {} }
  let { level, xp: inLevel } = pet
  const wasStage = stageOf(level)
  inLevel += xp
  while (inLevel >= xpToNext(level)) {
    inLevel -= xpToNext(level)
    level += 1
    effects.push({ kind: 'levelUp', level })
  }
  const stage = stageOf(level)
  if (stage !== wasStage) effects.push({ kind: 'evolved', stage })
  effects.unshift({ kind: 'xp', activity, xp })

  return {
    ...pet,
    level,
    xp: inLevel,
    totalXp: pet.totalXp + xp,
    today: { date, xp: { ...today.xp, [activity]: (today.xp[activity] ?? 0) + xp } },
  }
}

/** The achievements newly earned, added to the pet and to `effects`. */
function award(pet: CodingPetState, registry: CodingPetRegistry, now: number, effects: CodingPetEffect[]): CodingPetState {
  const earned = registry.achievements.filter(one => {
    if (pet.achievements.includes(one.id)) return false
    const { level, total, fedStreak: streak } = one.when
    if (level !== undefined && pet.level < level) return false
    if (total !== undefined && (pet.totals[total.kind] ?? 0) < total.atLeast) return false
    if (streak !== undefined && fedStreak(pet.fedDays, now) < streak) return false
    return level !== undefined || total !== undefined || streak !== undefined
  })
  for (const one of earned) effects.push({ kind: 'achievement', id: one.id, title: one.title, emoji: one.emoji })

  return earned.length === 0 ? pet : { ...pet, achievements: [...pet.achievements, ...earned.map(one => one.id)] }
}

/** Counts an activity and grants its XP, unless it is cooling down. */
function activity(
  pet: CodingPetState,
  kind: string,
  given: number | undefined,
  registry: CodingPetRegistry,
  now: number,
  effects: CodingPetEffect[],
): CodingPetState {
  const rule = registry.activities.find(one => one.kind === kind)
  const xp = Math.max(0, Math.min(MAX_GRANT, Math.round(given ?? rule?.xp ?? 0)))
  const cooldown = rule?.cooldownMs ?? (rule === undefined ? AWARD_COOLDOWN_MS : 0)
  const isCooling = now - (pet.lastGrant[kind] ?? -Infinity) < cooldown
  let next: CodingPetState = { ...pet, totals: count(pet.totals, kind), stats: applyDelta(pet.stats, rule?.cost) }
  if (isCooling || xp === 0) return next

  // A hungry or worn-out pet learns at half speed: look after it.
  const isNeedy = pet.stats.fullness < 20 || pet.stats.energy < 15
  next = { ...next, lastGrant: { ...pet.lastGrant, [kind]: now } }
  return gainXp(next, kind, isNeedy ? Math.max(1, Math.floor(xp / 2)) : xp, now, effects)
}

/**
 * One action applied to a pet at `now`: the pet after it and what it caused.
 * Pure, so every rule of the game is tested without an engine.
 */
export function reduce(
  before: CodingPetState,
  action: CodingPetAction,
  now: number,
  registry: CodingPetRegistry,
  settings: Settings,
): Reduced {
  const effects: CodingPetEffect[] = []
  let pet = decay(before, now, settings)
  const isAsleep = pet.sleepingUntil > now

  switch (action.kind) {
    case 'tick':
      break
    case 'activity':
      pet = activity(pet, action.activity, action.xp, registry, now, effects)
      break
    case 'feed': {
      const food = action.food === undefined ? registry.foods[0] : registry.foods.find(one => one.id === action.food?.toLowerCase())
      if (food === undefined) {
        effects.push({ kind: 'refused', text: `There is no "${action.food ?? ''}" in the fridge. Try ${registry.foods.map(one => one.id).join(', ')}.` })
        break
      }
      if (isAsleep) {
        effects.push({ kind: 'refused', text: `${pet.name} is asleep. Let it rest, or wake it with /codepet rest.` })
        break
      }
      const last = pet.lastGrant[`food:${food.id}`] ?? -Infinity
      if (now - last < food.cooldownMs) {
        const minutes = Math.ceil((food.cooldownMs - (now - last)) / 60_000)
        effects.push({ kind: 'refused', text: `${pet.name} had ${food.emoji} ${food.id} not long ago. Try again in ${minutes} min.` })
        break
      }
      if (pet.stats.fullness >= 95 && (food.effect.fullness ?? 0) > 0) {
        pet = { ...pet, stats: applyDelta(pet.stats, { happiness: -2 }) }
        effects.push({ kind: 'refused', text: `${pet.name} is full and pushes the ${food.id} away.` })
        break
      }
      const date = dayOf(now)
      pet = {
        ...pet,
        stats: applyDelta(pet.stats, food.effect),
        lastGrant: { ...pet.lastGrant, [`food:${food.id}`]: now },
        fedDays: pet.fedDays.includes(date) ? pet.fedDays : [...pet.fedDays, date].slice(-30),
      }
      effects.push({ kind: 'said', text: `${pet.name} munches the ${food.emoji} ${food.id}. Nom!` })
      pet = activity(pet, 'feed', undefined, registry, now, effects)
      break
    }
    case 'play':
      if (isAsleep) {
        effects.push({ kind: 'refused', text: `${pet.name} is asleep. Let it rest, or wake it with /codepet rest.` })
        break
      }
      if (pet.stats.energy < 15) {
        effects.push({ kind: 'refused', text: `${pet.name} is too tired to play. Let it rest: /codepet rest.` })
        break
      }
      pet = { ...pet, stats: applyDelta(pet.stats, { happiness: 15, energy: -10, fullness: -5 }) }
      effects.push({ kind: 'said', text: `${pet.name} chases a ball around. ♥` })
      pet = activity(pet, 'play', undefined, registry, now, effects)
      break
    case 'rest':
      if (isAsleep) {
        pet = { ...pet, sleepingUntil: 0 }
        effects.push({ kind: 'said', text: `${pet.name} wakes up and stretches.` })
      } else {
        pet = { ...pet, sleepingUntil: now + REST_MS }
        effects.push({ kind: 'said', text: `${pet.name} curls up for a ${REST_MS / 60_000} minute nap. zZ` })
      }
      break
    case 'rename': {
      const name = action.name.trim().slice(0, 24)
      if (name === '') {
        effects.push({ kind: 'refused', text: 'Give it a name: /codepet name <name>.' })
        break
      }
      effects.push({ kind: 'said', text: `${pet.name} is now called ${name}.` })
      pet = { ...pet, name }
      break
    }
    case 'species': {
      const species = registry.species.find(one => one.id === action.species.trim().toLowerCase())
      if (species === undefined) {
        effects.push({ kind: 'refused', text: `Pick one of: ${registry.species.map(one => one.id).join(', ')}.` })
        break
      }
      pet = { ...pet, species: species.id }
      effects.push({ kind: 'said', text: `${pet.name} is a ${species.id} now. ${species.emoji}` })
      break
    }
  }

  return { pet: award(pet, registry, now, effects), effects }
}
