/** The kinds of pet the mod draws. */
export type Species = 'clawd' | 'cat' | 'dog' | 'crab' | 'fox' | 'duck' | 'rabbit' | 'snake'

/** A pet you keep; kept across sessions in `$.store`. */
export type Pet = {
  id: string
  name: string
  species: Species
}

/** What a pet is doing right now. */
export type Mood = 'walk' | 'run' | 'sit' | 'sleep' | 'chase' | 'happy' | 'sad'

/** A pet on the playground: where it is and what it does. */
export type Actor = {
  /** The `Pet` it draws. */
  id: string
  /** Its left edge, in cells. */
  x: number
  /** 1 faces right, -1 faces left. */
  dir: 1 | -1
  mood: Mood
  /** Ticks left in this mood. */
  ticks: number
  /** Which walk frame shows: 0 or 1. */
  frame: number
  /** A word or glyph beside its head (`♥`, `z`, `!`), or empty. */
  bubble: string
}

/** A ball rolling on the playground. */
export type Ball = {
  x: number
  /** Cells per tick; slows as it rolls. */
  vx: number
}

export type Scene = {
  tick: number
  /** The random generator's state, so each step is reproducible. */
  seed: number
  /** The tick of the last prompt or turn; pets fall asleep a while after it. */
  lastActive: number
  actors: Actor[]
  ball: Ball | null
}

declare module 'claude-code' {
  interface PluginState {
    'claude-pets': {
      pets: Pet[]
      scene: Scene
      isHidden: boolean
      /** The side panel is open; the strip above the prompt steps aside for it. */
      isPaneOpen: boolean
    }
  }
}
