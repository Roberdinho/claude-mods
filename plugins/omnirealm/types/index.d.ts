/**
 * One frame of the world as the desktop draws it: the game runs in the
 * Client, which posts what is in view; the hooks module paints it as SVG.
 * Coordinates are tiles relative to the view's top left.
 */
export type OmniFrame = {
  vw: number
  vh: number
  /** The view's top left in world tiles, so decorations stay put as it pans. */
  camX: number
  camY: number
  tick: number
  /** `vw * vh` characters, one per tile: `'A'` plus the terrain code. */
  terr: string
  /** With borders on, `vw * vh` characters: `'0'` none, else `'0'` plus kingdom id plus one. */
  owner: string
  /** Burning tiles, as `y * vw + x`. */
  fire: number[]
  /** Triplets: tile index, kingdom id, 1 for the capital. */
  houses: number[]
  /** Sextuplets: x, y, kind index, kingdom id or -1, flags (1 ruler, 2 sick, 4 mad, 8 selected), id. */
  units: number[]
  /** Quintuplets: effect index, x, y, radius, frames left. */
  fx: number[]
  /** Empty, or x, y, radius of the brush under the pointer. */
  hover: number[]
  /** Kingdom colours by id. */
  colors: string[]
  hud: OmniHud
  info: OmniInfo
  realms: OmniRealm[]
  log: string[]
}

export type OmniHud = {
  year: number
  pop: number
  kingdoms: number
  wars: number
  beasts: number
  cat: string
  tool: string
  toolLabel: string
  paused: boolean
  speed: number
  brush: number
  zoom: number
  borders: boolean
  view: 'map' | 'realms'
  /** The last command the game applied: what the panel's buttons sent, acknowledged. */
  ack: number
  /** Rows of text the map's box takes on the desktop, which the input region spans. */
  rows: number
}

export type OmniTrait = { name: string; good: boolean }

export type OmniInfo =
  | { kind: 'log' }
  | { kind: 'unit'; name: string; color: string; line: string; traits: OmniTrait[]; canTrait: boolean; follow: boolean }

export type OmniRealm = { name: string; color: string; text: string; wars: string; allies: string }

/** A press on a desktop Button, handed to the Client through its props. */
export type OmniCmd = { seq: number; act: string }

declare module 'claude-code' {
  interface PluginState {
    omnirealm: { frame: OmniFrame; cmds: OmniCmd[] }
  }
}
