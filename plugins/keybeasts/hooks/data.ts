import type { EmoteEvent, Rarity, Slot } from '../types'

export type Beast = {
  id: string
  name: string
  isStarter: boolean
  /** Prijs in keys; null = alleen uit een ei. */
  price: number | null
  /** Kans-gewicht bij het uitbroeden van een ei. */
  eggWeight: number
  /** Waar een hoed staat op het 160x160-canvas: midden-x, onderkant-y en breedte. */
  hat: { x: number; y: number; w: number }
}

export type Item = { id: string; name: string; slot: Slot; rarity: Rarity }

export const RARITIES: readonly Rarity[] = ['gewoon', 'ongewoon', 'zeldzaam', 'episch', 'legendarisch']

export const RARITY_LABEL: Record<Rarity, string> = {
  gewoon: 'Gewoon',
  ongewoon: 'Ongewoon',
  zeldzaam: 'Zeldzaam',
  episch: 'Episch',
  legendarisch: 'Legendarisch',
}

export const RARITY_COLOR: Record<Rarity, string> = {
  gewoon: '#9aa0a6',
  ongewoon: '#34a853',
  zeldzaam: '#4285f4',
  episch: '#a142f4',
  legendarisch: '#f9ab00',
}

/** Kans per miljoen: 90% / 9,5% / 0,49% / 0,01% / 1 op 500.000. */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  gewoon: 899_998,
  ongewoon: 95_000,
  zeldzaam: 4_900,
  episch: 100,
  legendarisch: 2,
}

/** Kans (0..1) dat een kist van zeldzaam of hoger een ei geeft in plaats van een item. */
export const EGG_CHANCE = 0.5
export const CHEST_MINUTES = 30
export const EGG_MINUTES = 60
export const CHEST_PRICE = 500
export const EXCHANGE_COUNT = 10
export const EGG_DUPLICATE_BONUS = 2_000
export const SLEEP_AFTER_MS = 5 * 60_000

export const POINTS = { promptTap: 1, toolCall: 2, turn: 5 } as const

const HAT = { x: 80, y: 46, w: 70 }

export const BEASTS: readonly Beast[] = [
  { id: 'hond', name: 'Hond', isStarter: true, price: null, eggWeight: 0, hat: HAT },
  { id: 'kat', name: 'Kat', isStarter: true, price: null, eggWeight: 0, hat: HAT },
  { id: 'kanarie', name: 'Kanarie', isStarter: true, price: null, eggWeight: 0, hat: HAT },
  { id: 'konijn', name: 'Konijn', isStarter: false, price: 1_500, eggWeight: 10, hat: HAT },
  { id: 'cavia', name: 'Cavia', isStarter: false, price: 1_500, eggWeight: 10, hat: HAT },
  { id: 'big', name: 'Big', isStarter: false, price: 2_500, eggWeight: 8, hat: HAT },
  { id: 'otter', name: 'Otter', isStarter: false, price: 4_000, eggWeight: 6, hat: HAT },
  { id: 'vos', name: 'Vos', isStarter: false, price: 4_000, eggWeight: 6, hat: HAT },
  { id: 'uil', name: 'Uil', isStarter: false, price: 6_000, eggWeight: 4, hat: HAT },
  { id: 'axolotl', name: 'Axolotl', isStarter: false, price: null, eggWeight: 3, hat: HAT },
]

export const ITEMS: readonly Item[] = [
  { id: 'pet', name: 'Pet', slot: 'hoed', rarity: 'gewoon' },
  { id: 'muts', name: 'Muts', slot: 'hoed', rarity: 'gewoon' },
  { id: 'keyboard', name: 'Keyboard', slot: 'instrument', rarity: 'gewoon' },
  { id: 'hartje', name: 'Hartje', slot: 'emote', rarity: 'gewoon' },
  { id: 'zzz', name: 'Zzz', slot: 'emote', rarity: 'gewoon' },
  { id: 'koptelefoon', name: 'Koptelefoon', slot: 'hoed', rarity: 'ongewoon' },
  { id: 'cowboyhoed', name: 'Cowboyhoed', slot: 'hoed', rarity: 'ongewoon' },
  { id: 'propellerpet', name: 'Propellerpet', slot: 'hoed', rarity: 'ongewoon' },
  { id: 'drums', name: 'Drums', slot: 'instrument', rarity: 'ongewoon' },
  { id: 'vuur', name: 'Vuur', slot: 'emote', rarity: 'ongewoon' },
  { id: 'uitroep', name: 'Uitroepteken', slot: 'emote', rarity: 'ongewoon' },
  { id: 'hogehoed', name: 'Hoge hoed', slot: 'hoed', rarity: 'zeldzaam' },
  { id: 'piratenhoed', name: 'Piratenhoed', slot: 'hoed', rarity: 'zeldzaam' },
  { id: 'cowbell', name: 'Cowbell', slot: 'instrument', rarity: 'zeldzaam' },
  { id: 'tovenaarshoed', name: 'Tovenaarshoed', slot: 'hoed', rarity: 'episch' },
  { id: 'kroon', name: 'Kroon', slot: 'hoed', rarity: 'episch' },
  { id: 'keytar', name: 'Keytar', slot: 'instrument', rarity: 'episch' },
  { id: 'halo', name: 'Halo', slot: 'hoed', rarity: 'legendarisch' },
  { id: 'astronautenhelm', name: 'Astronautenhelm', slot: 'hoed', rarity: 'legendarisch' },
]

/** Waar elke emote op reageert. Je krijgt de reactie zodra je de emote bezit. */
export const EMOTE_TRIGGERS: Record<string, { event: EmoteEvent; text: string }> = {
  hartje: { event: 'beurt', text: 'als Claude een beurt afrondt' },
  vuur: { event: 'tool-ok', text: 'bij elke 5 gelukte tool-calls op rij' },
  uitroep: { event: 'tool-fout', text: 'als een tool-call mislukt' },
  zzz: { event: 'slapen', text: 'als je beestje in slaap valt' },
}
export const FIRE_STREAK = 5
export const EMOTE_MS = 3_000

export type Achievement = { id: string; name: string; text: string }

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'tools100', name: 'Handlanger', text: '100 tool-calls meegetrommeld' },
  { id: 'tools1000', name: 'Drumcomputer', text: '1000 tool-calls meegetrommeld' },
  { id: 'kisten10', name: 'Schatzoeker', text: '10 kisten geopend' },
  { id: 'zeldzaam', name: 'Bofkont', text: 'Je eerste Zeldzame (of beter) vondst' },
  { id: 'ruil', name: 'Handelaar', text: 'Je eerste ruil gedaan' },
  { id: 'ei', name: 'Broedmachine', text: 'Je eerste ei uitgebroed' },
  { id: 'verzamelaar', name: 'Dierentuin', text: 'Alle beestjes verzameld' },
]

export const TUTORIAL: readonly string[] = [
  'Dit is je beestje! Het trommelt mee als jij een prompt stuurt en als Claude tools gebruikt.',
  'Elke tik levert ⌨ keys op: +1 per tik bij je prompt, +2 per tool-call en +5 per afgeronde beurt.',
  'Elke 30 minuten actief werk krijg je een 🎁 kist. Open hem op het tabblad Kisten.',
  'In Spullen rust je hoeden en instrumenten uit. Emotes reageren vanzelf: ❤️ bij een afgeronde beurt, 🔥 bij 5 gelukte tools op rij, ❗ bij een fout, 💤 bij slapen. 10 dezelfde rarity ruil je in voor 1 betere.',
  'In de Winkel koop je nieuwe beestjes en extra kisten. Een zeldzame kist kan ook een 🥚 ei geven!',
  'Na 5 minuten zonder activiteit valt je beestje in slaap. Veel plezier! (Opnieuw: /keybeasts-tutorial)',
]

export const beastById = (id: string): Beast | undefined => BEASTS.find(b => b.id === id)
export const itemById = (id: string): Item | undefined => ITEMS.find(i => i.id === id)
