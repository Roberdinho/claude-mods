/** The three needs a pet has, each 0 to 100; higher is better. */
export type CodingPetStats = {
  happiness: number
  energy: number
  /** 100 is a full belly, 0 is starving. */
  fullness: number
}

/** The growth stages, in order; each looks different. */
export type CodingPetStage = 'egg' | 'baby' | 'teen' | 'adult'

/** What a pet is doing or feeling, derived from its stats; never stored. */
export type CodingPetMood = 'sleeping' | 'coding' | 'hungry' | 'tired' | 'sad' | 'happy' | 'ok'

/** The pet as kept across sessions in `$.store`. */
export type CodingPetState = {
  schemaVersion: number
  name: string
  species: string
  level: number
  /** XP inside the current level. */
  xp: number
  /** XP ever earned. */
  totalXp: number
  stats: CodingPetStats
  /** Epoch ms of hatching. */
  born: number
  /** Epoch ms the stats were last brought up to date. */
  lastUpdated: number
  /** Epoch ms the pet wakes from a rest; 0 when awake. */
  sleepingUntil: number
  /** How many times each activity or care action happened, ever. */
  totals: Record<string, number>
  /** XP earned today, per activity; starts over when the local date changes. */
  today: { date: string; xp: Record<string, number> }
  /** Epoch ms each activity last granted XP, for its cooldown. */
  lastGrant: Record<string, number>
  /** The local dates (YYYY-MM-DD) the pet was fed, newest last, at most 30. */
  fedDays: string[]
  /** Ids of the achievements earned. */
  achievements: string[]
  /** The name and species the settings last gave, so a change there applies once. */
  configured: { name: string; species: string }
}

/** What happens to a pet. Everything that changes a pet is one of these. */
export type CodingPetAction =
  | { kind: 'activity'; activity: string; xp?: number; reason?: string }
  | { kind: 'feed'; food?: string }
  | { kind: 'play' }
  | { kind: 'rest' }
  | { kind: 'tick' }
  | { kind: 'rename'; name: string }
  | { kind: 'species'; species: string }

/** What an action caused, for the person to hear about. */
export type CodingPetEffect =
  | { kind: 'xp'; activity: string; xp: number }
  | { kind: 'levelUp'; level: number }
  | { kind: 'evolved'; stage: CodingPetStage }
  | { kind: 'achievement'; id: string; title: string; emoji: string }
  | { kind: 'said'; text: string }
  | { kind: 'refused'; text: string }

/** A pet as other plugins see it. */
export type CodingPetView = {
  name: string
  species: string
  stage: CodingPetStage
  level: number
  xp: number
  xpToNext: number
  totalXp: number
  stats: CodingPetStats
  mood: CodingPetMood
  achievements: string[]
}

/**
 * What the panel shows, and nothing more: numbers as drawn, lists as listed.
 * The panel reads this alone, and it is written only when it differs, so the
 * panel redraws (and its picture reloads) only when something visible changes.
 */
export type CodingPetPaneView = {
  name: string
  species: string
  stage: CodingPetStage
  mood: CodingPetMood
  level: number
  xp: number
  xpToNext: number
  totalXp: number
  stats: CodingPetStats
  today: { label: string; xp: number }[]
  totals: { label: string; count: number }[]
  achievements: { id: string; title: string; emoji: string; description: string; isEarned: boolean }[]
  foods: { id: string; emoji: string }[]
}

/** Changes to the stats, applied as given (negative lowers). */
export type CodingPetStatDelta = Partial<CodingPetStats>

/** Art for one species: per stage, two frames of rows; `{f}` is the face. */
export type CodingPetSpecies = {
  id: string
  /** Shown in lists and the status line. */
  emoji: string
  color: string
  names: string[]
  art: Partial<Record<CodingPetStage, [string[], string[]]>>
}

export type CodingPetFood = {
  id: string
  emoji: string
  /** What it does to the stats. */
  effect: CodingPetStatDelta
  /** How long before this food can be given again. */
  cooldownMs: number
}

/**
 * An XP rule: which signal earns it, how much, and what it costs.
 *
 * `on` picks the signal: a tool call that succeeded or failed (narrowed by
 * `tools`, `*` for any, and `command`, a regular expression over a shell
 * command), a prompt sent, a turn finished, or `award` for XP granted by
 * name (the care actions and other plugins).
 */
export type CodingPetActivity = {
  kind: string
  label: string
  xp: number
  on: 'tool' | 'toolError' | 'prompt' | 'turn' | 'award'
  tools?: string[]
  command?: string
  cost?: CodingPetStatDelta
  /** Within this long of its last grant an activity counts but earns nothing. */
  cooldownMs?: number
}

/** An achievement, earned the first time its condition holds. */
export type CodingPetAchievement = {
  id: string
  title: string
  emoji: string
  description: string
  when: { level?: number; total?: { kind: string; atLeast: number }; fedStreak?: number }
}

/** The tables a pet is made from: the built-in rows plus what other plugins added. */
export type CodingPetRegistry = {
  species: CodingPetSpecies[]
  foods: CodingPetFood[]
  activities: CodingPetActivity[]
  achievements: CodingPetAchievement[]
}

/** XP another plugin grants: an activity by kind, with its own amount (capped at 50). */
export type CodingPetGrant = { kind: string; xp?: number; reason?: string }

/** `$.codingPet`: the pet for other plugins to read, reward and extend. */
export type CodingPet = {
  /** The pet now. */
  get: () => Promise<CodingPetView>
  /** Grants XP for an activity; an unknown kind earns `xp` under its own name. */
  award: (grant: CodingPetGrant) => Promise<CodingPetEffect[]>
  /** Feeds, plays, rests, renames: any action. */
  act: (action: CodingPetAction) => Promise<CodingPetEffect[]>
  /** Adds rows to the tables for this session; a row with an id already there replaces it. */
  addSpecies: (species: CodingPetSpecies) => Promise<void>
  addFood: (food: CodingPetFood) => Promise<void>
  addActivity: (activity: CodingPetActivity) => Promise<void>
  addAchievement: (achievement: CodingPetAchievement) => Promise<void>
}

declare module 'claude-code' {
  interface EngineInterface {
    codingPet: CodingPet
  }

  interface PluginState {
    'coding-pet': {
      pet: CodingPetState | null
      /** Rows other plugins added this session. */
      extensions: CodingPetRegistry
      /** The animation frame counter. */
      frame: number
      isHidden: boolean
      /** A turn is running. */
      isBusy: boolean
      /** The panel is open; the strip above the prompt steps aside for it. */
      isPaneOpen: boolean
      /** `/codepet close` put the strip above the prompt away too; `/codepet show` brings it back. */
      isStripClosed: boolean
      /** What the panel shows; see CodingPetPaneView. */
      paneView: CodingPetPaneView | null
    }
  }
}
