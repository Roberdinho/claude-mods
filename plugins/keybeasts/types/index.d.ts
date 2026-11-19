export type Rarity = 'gewoon' | 'ongewoon' | 'zeldzaam' | 'episch' | 'legendarisch'
export type Slot = 'hoed' | 'instrument' | 'emote'
export type Pose = 'idle' | 'links' | 'rechts' | 'beide' | 'slapen' | 'klaar' | 'boos'
export type Tab = 'beest' | 'kisten' | 'spullen' | 'winkel' | 'prestaties'
/** Gebeurtenissen waar een emote op reageert. */
export type EmoteEvent = 'beurt' | 'tool-ok' | 'tool-fout' | 'slapen'

export type Egg = { id: string; progress: number }
export type Equipped = { hoed?: string; instrument?: string; emote?: string }

export type Save = {
  v: 1
  keys: number
  owned: string[]
  active: string | null
  chests: number
  chestProgress: number
  eggs: Egg[]
  inventory: Record<string, number>
  equipped: Record<string, Equipped>
  stats: {
    toolCalls: number
    prompts: number
    turns: number
    chestsOpened: number
    eggsHatched: number
    exchanges: number
    activeMinutes: number
  }
  achievements: string[]
  tutorialStep: number
  sound: boolean
  lastEventAt: number
  /** De laatste klokminuut (ms / 60000) die al als actief/inactief geteld is, gedeeld door alle sessies. */
  lastTickMinute: number
  /** Emotes die je hebt uitgezet; een emote die je bezit en niet uitzette reageert vanzelf. */
  emotesOff: string[]
}

declare module 'claude-code' {
  interface PluginState {
    keybeasts: {
      save: Shaped<Save | null>
      pose: Shaped<Pose>
      tab: Shaped<Tab>
      notice: Shaped<string>
      /** De emote die nu even naast het beestje staat ('' = geen). */
      emote: Shaped<string>
    }
  }
}
