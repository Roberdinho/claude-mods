// Pure spellogica: geen `$`, dus los te testen. Elke functie geeft een nieuwe Save terug.
import type { EmoteEvent, Rarity, Save, Slot } from '../types'
import {
  ACHIEVEMENTS,
  BEASTS,
  CHEST_MINUTES,
  CHEST_PRICE,
  EGG_CHANCE,
  EGG_DUPLICATE_BONUS,
  EGG_MINUTES,
  EMOTE_TRIGGERS,
  FIRE_STREAK,
  EXCHANGE_COUNT,
  ITEMS,
  RARITIES,
  RARITY_LABEL,
  RARITY_WEIGHT,
  beastById,
  itemById,
} from './data'

/** Een getal in [0, 1). */
export type Rng = () => number

export type Result = { save: Save; note?: string; error?: string }

/** Deterministische RNG voor tests. */
export const seeded = (seed: number): Rng => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const newSave = (): Save => ({
  v: 1,
  keys: 0,
  owned: [],
  active: null,
  chests: 1,
  chestProgress: 0,
  eggs: [],
  inventory: {},
  equipped: {},
  stats: { toolCalls: 0, prompts: 0, turns: 0, chestsOpened: 0, eggsHatched: 0, exchanges: 0, activeMinutes: 0 },
  achievements: [],
  tutorialStep: 0,
  sound: false,
  lastEventAt: 0,
  lastTickMinute: 0,
  emotesOff: [],
})

const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** Leest wat er in de store stond; onbekend of kapot geeft een nieuwe save, ontbrekende velden worden aangevuld. */
/** Items die niet meer bestaan en waar ze in een oude opslag door vervangen worden. */
const RENAMED: Record<string, string> = { bandana: 'propellerpet' }

const renameItems = (inv: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const [id, n] of Object.entries(inv)) {
    const to = RENAMED[id] ?? id
    out[to] = (out[to] ?? 0) + n
  }
  return out
}

export const migrate = (raw: unknown): Save => {
  const base = newSave()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Partial<Save>
  if (r.v !== 1) return base
  const owned = Array.isArray(r.owned) ? r.owned.filter(id => typeof id === 'string' && beastById(id)) : []
  return {
    ...base,
    keys: num(r.keys, 0),
    owned,
    active: typeof r.active === 'string' && owned.includes(r.active) ? r.active : (owned[0] ?? null),
    chests: num(r.chests, base.chests),
    chestProgress: num(r.chestProgress, 0),
    eggs: Array.isArray(r.eggs) ? r.eggs.filter(e => e && typeof e.id === 'string').map(e => ({ id: e.id, progress: num(e.progress, 0) })) : [],
    inventory: renameItems(typeof r.inventory === 'object' && r.inventory ? r.inventory : {}),
    equipped: Object.fromEntries(
      Object.entries(typeof r.equipped === 'object' && r.equipped ? r.equipped : {}).map(([beast, gear]) => [
        beast,
        { ...gear, ...(gear?.hoed && RENAMED[gear.hoed] ? { hoed: RENAMED[gear.hoed] } : {}) },
      ]),
    ),
    stats: { ...base.stats, ...(typeof r.stats === 'object' && r.stats ? r.stats : {}) },
    achievements: Array.isArray(r.achievements) ? r.achievements.filter(a => typeof a === 'string') : [],
    tutorialStep: num(r.tutorialStep, 0),
    sound: r.sound === true,
    lastEventAt: num(r.lastEventAt, 0),
    lastTickMinute: num(r.lastTickMinute, 0),
    emotesOff: Array.isArray(r.emotesOff) ? r.emotesOff.filter(e => typeof e === 'string') : [],
  }
}

export const chooseStarter = (s: Save, id: string): Result => {
  const beast = beastById(id)
  if (!beast?.isStarter) return { save: s, error: 'Dat is geen starter.' }
  if (s.owned.length > 0) return { save: s, error: 'Je hebt al een starter.' }
  return { save: { ...s, owned: [id], active: id, tutorialStep: 0 }, note: `Welkom, ${beast.name}!` }
}

export const addKeys = (s: Save, n: number): Save => ({ ...s, keys: s.keys + n })

export const recordPrompt = (s: Save, taps: number, now: number): Save => ({
  ...addKeys(s, taps),
  stats: { ...s.stats, prompts: s.stats.prompts + 1 },
  lastEventAt: now,
})

export const recordToolCall = (s: Save, points: number, now: number): Save => ({
  ...addKeys(s, points),
  stats: { ...s.stats, toolCalls: s.stats.toolCalls + 1 },
  lastEventAt: now,
})

export const recordTurn = (s: Save, points: number, now: number): Save => ({
  ...addKeys(s, points),
  stats: { ...s.stats, turns: s.stats.turns + 1 },
  lastEventAt: now,
})

/** Wordt elke minuut aangeroepen; telt alleen als er die minuut iets gebeurde. */
export const tickMinute = (s: Save, wasActive: boolean, rng: Rng): Result => {
  if (!wasActive || s.owned.length === 0) return { save: s }
  let save: Save = { ...s, stats: { ...s.stats, activeMinutes: s.stats.activeMinutes + 1 } }
  const notes: string[] = []
  let progress = save.chestProgress + 1
  if (progress >= CHEST_MINUTES) {
    progress -= CHEST_MINUTES
    save = { ...save, chests: save.chests + 1 }
    notes.push('🎁 Je hebt een nieuwe kist verdiend!')
  }
  save = { ...save, chestProgress: progress }
  const eggs = save.eggs.map(e => ({ ...e, progress: e.progress + 1 }))
  const ready = eggs.filter(e => e.progress >= EGG_MINUTES)
  save = { ...save, eggs: eggs.filter(e => e.progress < EGG_MINUTES) }
  for (const _ of ready) {
    const hatched = hatch(save, rng)
    save = hatched.save
    if (hatched.note) notes.push(hatched.note)
  }
  return { save, note: notes.join(' ') || undefined }
}

/**
 * Eén klokminuut-tik vanuit een sessie. Alle open sessies tikken, maar elke klokminuut telt
 * maar één keer: de eerste sessie die hem ziet zet lastTickMinute in de gedeelde save.
 */
export const tickClock = (s: Save, now: number, localLastEventAt: number, rng: Rng): Result => {
  const minute = Math.floor(now / 60_000)
  if (s.lastTickMinute >= minute) return { save: s }
  const latest = Math.max(s.lastEventAt, localLastEventAt)
  return tickMinute({ ...s, lastTickMinute: minute }, now - latest < 60_000, rng)
}

export const hatch = (s: Save, rng: Rng): Result => {
  const candidates = BEASTS.filter(b => b.eggWeight > 0 && !s.owned.includes(b.id))
  const stats = { ...s.stats, eggsHatched: s.stats.eggsHatched + 1 }
  if (candidates.length === 0) {
    return { save: { ...s, stats, keys: s.keys + EGG_DUPLICATE_BONUS }, note: `🥚 Het ei bevatte ${EGG_DUPLICATE_BONUS} keys!` }
  }
  const total = candidates.reduce((n, b) => n + b.eggWeight, 0)
  let roll = rng() * total
  const beast = candidates.find(b => (roll -= b.eggWeight) < 0) ?? candidates[candidates.length - 1]!
  return { save: { ...s, stats, owned: [...s.owned, beast.id] }, note: `🐣 Je ei is uitgekomen: ${beast.name}!` }
}

export const rollRarity = (rng: Rng): Rarity => {
  let roll = rng() * 1_000_000
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHT[r]
    if (roll < 0) return r
  }
  return 'gewoon'
}

const pickItem = (rarity: Rarity, rng: Rng) => {
  const pool = ITEMS.filter(i => i.rarity === rarity)
  return pool[Math.floor(rng() * pool.length)]!
}

export type Drop = { kind: 'item'; itemId: string; rarity: Rarity } | { kind: 'ei'; rarity: Rarity }

export const openChest = (s: Save, rng: Rng): Result & { drop?: Drop } => {
  if (s.chests <= 0) return { save: s, error: 'Je hebt geen kisten.' }
  const rarity = rollRarity(rng)
  const stats = { ...s.stats, chestsOpened: s.stats.chestsOpened + 1 }
  const base: Save = { ...s, chests: s.chests - 1, stats }
  const isRare = RARITIES.indexOf(rarity) >= RARITIES.indexOf('zeldzaam')
  if (isRare && rng() < EGG_CHANCE) {
    const egg = { id: `ei-${stats.chestsOpened}-${Math.floor(rng() * 1e6)}`, progress: 0 }
    return {
      save: { ...base, eggs: [...base.eggs, egg] },
      drop: { kind: 'ei', rarity },
      note: `🥚 ${RARITY_LABEL[rarity]} ei! Het komt uit na ${EGG_MINUTES} actieve minuten.`,
    }
  }
  const item = pickItem(rarity, rng)
  return {
    save: { ...base, inventory: { ...base.inventory, [item.id]: (base.inventory[item.id] ?? 0) + 1 } },
    drop: { kind: 'item', itemId: item.id, rarity },
    note: `${RARITY_LABEL[rarity]}: ${item.name}!`,
  }
}

export const buyChest = (s: Save): Result => {
  if (s.keys < CHEST_PRICE) return { save: s, error: `Je hebt ${CHEST_PRICE} keys nodig.` }
  return { save: { ...s, keys: s.keys - CHEST_PRICE, chests: s.chests + 1 }, note: '🎁 Kist gekocht.' }
}

export const buyBeast = (s: Save, id: string): Result => {
  const beast = beastById(id)
  if (!beast) return { save: s, error: 'Onbekend beestje.' }
  if (s.owned.includes(id)) return { save: s, error: `Je hebt ${beast.name} al.` }
  if (beast.price === null) return { save: s, error: `${beast.name} kun je niet kopen.` }
  if (s.keys < beast.price) return { save: s, error: `Je hebt ${beast.price} keys nodig.` }
  return { save: { ...s, keys: s.keys - beast.price, owned: [...s.owned, id] }, note: `${beast.name} is van jou!` }
}

export const setActive = (s: Save, id: string): Result =>
  s.owned.includes(id) ? { save: { ...s, active: id } } : { save: s, error: 'Dat beestje heb je nog niet.' }

/** De emote die op deze gebeurtenis reageert: alleen als je hem bezit en niet hebt uitgezet. */
export const emoteFor = (s: Save, event: EmoteEvent, streak = 0): string | null => {
  if (event === 'tool-ok' && (streak <= 0 || streak % FIRE_STREAK !== 0)) return null
  const id = Object.keys(EMOTE_TRIGGERS).find(k => EMOTE_TRIGGERS[k]!.event === event)
  if (!id || (s.inventory[id] ?? 0) <= 0 || s.emotesOff.includes(id)) return null
  return id
}

/** Zet de reactie van een emote die je bezit aan of uit. */
export const toggleEmote = (s: Save, id: string): Result => {
  const item = itemById(id)
  if (item?.slot !== 'emote') return { save: s, error: 'Dat is geen emote.' }
  if ((s.inventory[id] ?? 0) <= 0) return { save: s, error: `Je hebt geen ${item.name}.` }
  const off = s.emotesOff.includes(id)
  return {
    save: { ...s, emotesOff: off ? s.emotesOff.filter(e => e !== id) : [...s.emotesOff, id] },
    note: `${item.name} staat ${off ? 'aan' : 'uit'}.`,
  }
}

/** Rust een item uit op het actieve beestje; nogmaals hetzelfde item doet het af. */
export const toggleEquip = (s: Save, itemId: string): Result => {
  const item = itemById(itemId)
  if (!item || !s.active) return { save: s, error: 'Kan niet uitrusten.' }
  if (item.slot === 'emote') return toggleEmote(s, itemId)
  if ((s.inventory[itemId] ?? 0) <= 0) return { save: s, error: `Je hebt geen ${item.name}.` }
  const current = s.equipped[s.active] ?? {}
  const slot: Slot = item.slot
  const next = { ...current, [slot]: current[slot] === itemId ? undefined : itemId }
  return { save: { ...s, equipped: { ...s.equipped, [s.active]: next } } }
}

/** Hoeveel exemplaren in gebruik zijn: uitgeruste hoeden/instrumenten, en 1 per emote die aan staat. */
const isEquippedAnywhere = (s: Save, itemId: string): number => {
  if (itemById(itemId)?.slot === 'emote') return (s.inventory[itemId] ?? 0) > 0 && !s.emotesOff.includes(itemId) ? 1 : 0
  return Object.values(s.equipped).filter(e => e.hoed === itemId || e.instrument === itemId).length
}

/** Hoeveel items van deze rarity er vrij (niet uitgerust) zijn. */
export const spareOf = (s: Save, rarity: Rarity): { id: string; spare: number }[] =>
  ITEMS.filter(i => i.rarity === rarity)
    .map(i => ({ id: i.id, spare: Math.max(0, (s.inventory[i.id] ?? 0) - isEquippedAnywhere(s, i.id)) }))
    .filter(x => x.spare > 0)

/** 10 vrije items van één rarity → 1 item van de volgende rarity. Eerst de dubbele, uitgeruste items blijven. */
export const exchange = (s: Save, rarity: Rarity, rng: Rng): Result => {
  const next = RARITIES[RARITIES.indexOf(rarity) + 1]
  if (!next) return { save: s, error: 'Legendarisch is al het hoogste.' }
  const spare = spareOf(s, rarity).sort((a, b) => b.spare - a.spare)
  const total = spare.reduce((n, x) => n + x.spare, 0)
  if (total < EXCHANGE_COUNT) return { save: s, error: `Je hebt ${EXCHANGE_COUNT} vrije ${RARITY_LABEL[rarity]} items nodig (nu ${total}).` }
  const inventory = { ...s.inventory }
  let left = EXCHANGE_COUNT
  while (left > 0) {
    // Telkens één weghalen van het item met de meeste vrije exemplaren.
    spare.sort((a, b) => b.spare - a.spare)
    const top = spare[0]!
    top.spare -= 1
    inventory[top.id] = (inventory[top.id] ?? 0) - 1
    if (inventory[top.id] === 0) delete inventory[top.id]
    left -= 1
  }
  const item = pickItem(next, rng)
  inventory[item.id] = (inventory[item.id] ?? 0) + 1
  return {
    save: { ...s, inventory, stats: { ...s.stats, exchanges: s.stats.exchanges + 1 } },
    note: `Geruild voor ${RARITY_LABEL[next]}: ${item.name}!`,
  }
}

/** Kent nieuwe achievements toe en geeft hun namen terug. */
export const checkAchievements = (s: Save): { save: Save; unlocked: string[] } => {
  const has = new Set(s.achievements)
  const ownsRare = ITEMS.some(i => RARITIES.indexOf(i.rarity) >= 2 && (s.inventory[i.id] ?? 0) > 0)
  const earned: Record<string, boolean> = {
    tools100: s.stats.toolCalls >= 100,
    tools1000: s.stats.toolCalls >= 1000,
    kisten10: s.stats.chestsOpened >= 10,
    zeldzaam: ownsRare,
    ruil: s.stats.exchanges >= 1,
    ei: s.stats.eggsHatched >= 1,
    verzamelaar: BEASTS.every(b => s.owned.includes(b.id)),
  }
  const unlocked = ACHIEVEMENTS.filter(a => earned[a.id] && !has.has(a.id))
  if (unlocked.length === 0) return { save: s, unlocked: [] }
  return { save: { ...s, achievements: [...s.achievements, ...unlocked.map(a => a.id)] }, unlocked: unlocked.map(a => a.name) }
}

/** Aantal tikken voor een prompt: één per ~20 tekens, minimaal 1, maximaal 12. */
export const promptTaps = (text: string): number => Math.min(12, Math.max(1, Math.ceil(text.trim().length / 20)))
