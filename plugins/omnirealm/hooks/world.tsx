import type { ClientKeyEvent, ClientModule, ClientPointerEvent, ClientSurface, JsonValue } from 'claude-code'
import type { OmniCmd, OmniFrame, OmniInfo, OmniRealm } from '../types'

/*
 * OmniRealm: a god-simulator sandbox drawn in a Client region. The whole
 * world lives here, in the instance's local state, and runs on the region's
 * frame clock; the hooks module only opens the pane and keeps saves.
 */

// ---------------------------------------------------------------- world ---

const W = 112
const H = 72
const TICK_MS = 120
const TICKS_PER_YEAR = 48
const MAX_UNITS = 520
/** Room above the natural cap kept for what the god places by hand. */
const GOD_RESERVE = 60
const HOUSE_HP = 60
/** What a drawing may serialize to, under the 100,000 a Client's tree is held to. */
const TREE_BUDGET = 90_000

const DEEP = 0, SHALLOW = 1, SAND = 2, GRASS = 3, FOREST = 4, HILLS = 5, MOUNTAIN = 6, SNOW = 7,
  DESERT = 8, SWAMP = 9, ENCHANTED = 10, CORRUPTED = 11, LAVA = 12, ICE = 13, SCORCHED = 14

const TERRAIN_NAME = ['Deep ocean', 'Shallows', 'Sand', 'Grassland', 'Forest', 'Hills', 'Mountains', 'Tundra',
  'Desert', 'Swamp', 'Enchanted forest', 'Corrupted land', 'Lava', 'Ice', 'Scorched earth']
const TERRAIN_BG = ['#1b3a6b', '#2f6fb3', '#d9c47c', '#5c9e45', '#2e6a2e', '#8c8a55', '#6b6763', '#e4ecf0',
  '#e0b266', '#4b5a3a', '#5b3f8c', '#3d1f33', '#cf431b', '#a9d9ef', '#3b3431']
const TERRAIN_GLYPH = [' ', ' ', ' ', ' ', '♣', '^', '▲', ' ', ' ', '~', '*', '%', '~', ' ', '.']
const TERRAIN_FG = ['', '', '', '', '#4f9c3c', '#b4ae7b', '#a7a29d', '', '', '#708251', '#cda7ff', '#8f2f63', '#ffb320', '', '#6c6058']

const isWater = (t: number) => t === DEEP || t === SHALLOW
const FLAMMABLE: Record<number, number> = { [FOREST]: 0.22, [GRASS]: 0.07, [ENCHANTED]: 0.05, [SWAMP]: 0.015, [SNOW]: 0.01 }
const BUILDABLE = new Set([GRASS, SAND, DESERT, SNOW, HILLS, FOREST, ENCHANTED, SCORCHED])

// ---------------------------------------------------------------- kinds ---

type Race = 'human' | 'elf' | 'orc' | 'dwarf'
type Kind = Race | 'sheep' | 'chicken' | 'wolf' | 'bear' | 'dragon' | 'demon' | 'ufo' | 'zombie'

type KindInfo = { ch: string; color: string; hp: number; dmg: number; arm: number; spd: number; life: number; fly?: boolean; label: string }

const KINDS: Record<Kind, KindInfo> = {
  human: { ch: 'h', color: '#f4c99b', hp: 30, dmg: 4, arm: 1, spd: 2, life: 70, label: 'Human' },
  elf: { ch: 'e', color: '#9ff0b4', hp: 25, dmg: 4, arm: 0, spd: 3, life: 220, label: 'Elf' },
  orc: { ch: 'o', color: '#8fd14f', hp: 40, dmg: 6, arm: 1, spd: 2, life: 55, label: 'Orc' },
  dwarf: { ch: 'd', color: '#e0a060', hp: 40, dmg: 5, arm: 3, spd: 1, life: 160, label: 'Dwarf' },
  sheep: { ch: 's', color: '#ffffff', hp: 10, dmg: 0, arm: 0, spd: 1, life: 14, label: 'Sheep' },
  chicken: { ch: 'c', color: '#ffe680', hp: 5, dmg: 0, arm: 0, spd: 2, life: 8, label: 'Chicken' },
  wolf: { ch: 'w', color: '#c8c8c8', hp: 22, dmg: 5, arm: 0, spd: 3, life: 15, label: 'Wolf' },
  bear: { ch: 'B', color: '#a0703a', hp: 50, dmg: 9, arm: 2, spd: 2, life: 28, label: 'Bear' },
  dragon: { ch: 'D', color: '#ff3b1f', hp: 320, dmg: 26, arm: 6, spd: 2, life: 9999, fly: true, label: 'Dragon' },
  demon: { ch: 'X', color: '#ff2a7a', hp: 130, dmg: 15, arm: 3, spd: 2, life: 9999, label: 'Demon' },
  ufo: { ch: 'U', color: '#7dffd8', hp: 160, dmg: 0, arm: 5, spd: 3, life: 9999, fly: true, label: 'UFO' },
  zombie: { ch: 'z', color: '#7fbf3f', hp: 26, dmg: 5, arm: 0, spd: 1, life: 9999, label: 'Zombie' },
}

const RACES: Race[] = ['human', 'elf', 'orc', 'dwarf']
const isRace = (k: Kind): k is Race => k === 'human' || k === 'elf' || k === 'orc' || k === 'dwarf'
const isPrey = (k: Kind) => k === 'sheep' || k === 'chicken'
const isMonster = (k: Kind) => k === 'wolf' || k === 'bear' || k === 'dragon' || k === 'demon' || k === 'ufo' || k === 'zombie'

const TRAITS = ['genius', 'immune', 'bloodlust', 'giant', 'fast', 'strong', 'lucky', 'wise', 'fire_proof', 'regenerates',
  'weak', 'slow', 'frail'] as const
type Trait = (typeof TRAITS)[number]
const GOOD_TRAITS: Trait[] = ['genius', 'immune', 'giant', 'fast', 'strong', 'lucky', 'wise', 'fire_proof', 'regenerates']
const BAD_TRAITS: Trait[] = ['weak', 'slow', 'frail', 'bloodlust']

const SYLLABLES: Record<Race, string[]> = {
  human: ['al', 'ber', 'cor', 'dan', 'ed', 'fran', 'gar', 'hen', 'is', 'jo', 'ka', 'lo', 'mar', 'ric', 'sten', 'wil', 'ma', 'ra'],
  elf: ['ae', 'lin', 'thal', 'ri', 'el', 'sil', 'van', 'nor', 'ith', 'ya', 'lor', 'iel', 'ga', 'la', 'dri'],
  orc: ['gr', 'ug', 'mok', 'thar', 'zug', 'gor', 'krag', 'ush', 'bol', 'rok', 'naz', 'gul'],
  dwarf: ['dur', 'bal', 'thor', 'grim', 'nar', 'dain', 'kil', 'bor', 'gim', 'rum', 'fun', 'od'],
}
const REALM_SUFFIX: Record<Race, string[]> = {
  human: ['ia', 'land', 'shire', 'mark', 'ford'],
  elf: ['ndor', 'lith', 'wen', 'rion', 'thas'],
  orc: ['gash', 'mor', 'uk', 'nakh', 'zor'],
  dwarf: ['heim', 'grund', 'dal', 'karak', 'hold'],
}
const KINGDOM_COLORS = ['#ff5a5f', '#4ea8ff', '#ffd23f', '#c77dff', '#ff9f1c', '#2ec4b6', '#f15bb5', '#a3e635', '#00e5ff', '#ffffff', '#ff7b54', '#9b8cff']
const AGES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Steel Age', 'Gunpowder Age', 'Arcane Age']

type Unit = {
  id: number; k: Kind; x: number; y: number
  hp: number; max: number; dmg: number; arm: number; spd: number; age: number; life: number
  traits: Trait[]; kd: number; name: string
  sick: number; mad: number; tgt: number; tx: number; ty: number; mode: number; cd: number
}

type Kingdom = {
  id: number; race: Race; name: string; color: string; cx: number; cy: number
  wood: number; stone: number; food: number; tech: number; research: number
  king: number; rel: Record<string, number>; war: number[]; weary: Record<string, number>
  alive: boolean; founded: number; pop: number; houses: number
}

type Fx = { kind: 'rain' | 'flash' | 'boom' | 'tornado' | 'volcano' | 'heal' | 'plague' | 'magic' | 'nuke'; x: number; y: number; r: number; ttl: number }

type Cat = 'terrain' | 'nature' | 'life' | 'destroy' | 'magic' | 'inspect'
type View = 'map' | 'realms'

type Region = { row: number; x0: number; x1: number; act: () => void }

type Game = {
  terrain: Uint8Array; fire: Uint8Array; house: Int16Array; hhp: Uint8Array; territory: Int16Array
  units: Unit[]; byId: Map<number, Unit>; kingdoms: Kingdom[]; fx: Fx[]; log: string[]
  nextId: number; tick: number; speed: number; paused: boolean
  camX: number; camY: number; zoom: 1 | 2; cat: Cat; tool: string; brush: number
  view: View; borders: boolean; selected: number; follow: boolean
  hover: { x: number; y: number } | null; painting: boolean; lastPaint: number
  panning: { x: number; y: number; camX: number; camY: number } | null
  regions: Region[]; mapTop: number; mapRows: number; drawZoom: 1 | 2; detail: number; frames: number; loadedNonce: number; flash: string; flashTtl: number
  head: Int32Array; nextIdx: Int32Array
  /** Desktop: the map is the hooks module's picture, this region only its input. */
  desktop: boolean; dvh: number; cmdSeq: number; availRows: number; cols: number; rows: number
  outbox: { save?: boolean; load?: boolean }; lastFrame: string
}

// ------------------------------------------------------------- helpers ---

const rnd = Math.random
const ri = (n: number) => Math.floor(rnd() * n)
const pick = <T,>(xs: readonly T[]): T => xs[ri(xs.length)] as T
const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
const dist = (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16)
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t)
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)
}

function nameFor(race: Race): string {
  const s = SYLLABLES[race]
  return cap(pick(s) + pick(s) + (rnd() < 0.3 ? pick(s) : ''))
}

function log(g: Game, text: string) {
  g.log.push(`Y${year(g)} ${text}`)
  if (g.log.length > 80) g.log.shift()
}

const year = (g: Game) => Math.floor(g.tick / TICKS_PER_YEAR)

// ----------------------------------------------------------- generation ---

function noise(scale: number): (x: number, y: number) => number {
  const gw = Math.ceil(W / scale) + 2, gh = Math.ceil(H / scale) + 2
  const lattice = Array.from({ length: gw * gh }, () => rnd())
  const sm = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const fx = x / scale, fy = y / scale
    const x0 = Math.floor(fx), y0 = Math.floor(fy)
    const tx = sm(fx - x0), ty = sm(fy - y0)
    const v = (i: number, j: number) => lattice[j * gw + i] ?? 0
    const a = v(x0, y0) * (1 - tx) + v(x0 + 1, y0) * tx
    const b = v(x0, y0 + 1) * (1 - tx) + v(x0 + 1, y0 + 1) * tx
    return a * (1 - ty) + b * ty
  }
}

function fbm(scales: [number, number][]): (x: number, y: number) => number {
  const layers = scales.map(([s, w]) => [noise(s), w] as const)
  return (x, y) => layers.reduce((sum, [n, w]) => sum + n(x, y) * w, 0)
}

function generate(terrain: Uint8Array) {
  const elev = fbm([[22, 0.5], [10, 0.3], [4, 0.2]])
  const moist = fbm([[18, 0.6], [6, 0.4]])
  const magic = noise(9)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = x / W - 0.5, ny = y / H - 0.5
      const edge = Math.sqrt(nx * nx * 1.1 + ny * ny * 1.4) * 0.55
      const e = elev(x, y) - edge + 0.18
      const temp = 1 - Math.abs(ny) * 2.1 + (moist(x + 50, y) - 0.5) * 0.3 - Math.max(0, e - 0.6) * 1.2
      const m = moist(x, y)
      let t: number
      if (e < 0.3) t = DEEP
      else if (e < 0.37) t = temp < 0.12 ? ICE : SHALLOW
      else if (e < 0.4) t = temp < 0.2 ? SNOW : SAND
      else if (e < 0.63) {
        if (temp < 0.22) t = SNOW
        else if (temp > 0.72 && m < 0.42) t = DESERT
        else if (m > 0.66) t = temp > 0.55 ? SWAMP : FOREST
        else if (m > 0.5) t = FOREST
        else t = GRASS
        if ((t === FOREST || t === GRASS) && magic(x, y) > 0.8) t = ENCHANTED
      } else if (e < 0.72) t = HILLS
      else if (e < 0.82) t = MOUNTAIN
      else t = SNOW
      terrain[y * W + x] = t
    }
  }
}

function newGame(): Game {
  const g: Game = {
    terrain: new Uint8Array(W * H), fire: new Uint8Array(W * H), house: new Int16Array(W * H),
    hhp: new Uint8Array(W * H), territory: new Int16Array(W * H),
    units: [], byId: new Map(), kingdoms: [], fx: [], log: [],
    nextId: 1, tick: 0, speed: 1, paused: false,
    camX: 0, camY: 0, zoom: 2, cat: 'life', tool: 'human', brush: 2,
    view: 'map', borders: false, selected: -1, follow: false,
    hover: null, painting: false, lastPaint: -1, panning: null,
    regions: [], mapTop: 1, mapRows: 0, drawZoom: 2, detail: 3, frames: 0,
    desktop: false, dvh: 0, cmdSeq: 0, availRows: 30, cols: 0, rows: 0, outbox: {}, lastFrame: '', loadedNonce: 0, flash: '', flashTtl: 0,
    head: new Int32Array(W * H), nextIdx: new Int32Array(MAX_UNITS + 64),
  }
  generate(g.terrain)
  seedLife(g)
  // Open on the peoples, not an empty corner of ocean.
  const first = g.units.find(u => isRace(u.k))
  if (first !== undefined) { g.camX = first.x - 16; g.camY = first.y - 10 }
  log(g, 'The world is born.')
  return g
}

function randomLand(g: Game, ok: (t: number) => boolean = t => BUILDABLE.has(t) && t !== FOREST): [number, number] | null {
  for (let i = 0; i < 400; i++) {
    const x = 6 + ri(W - 12), y = 6 + ri(H - 12)
    if (ok(g.terrain[y * W + x] ?? DEEP)) return [x, y]
  }
  return null
}

function seedLife(g: Game) {
  for (const race of RACES) {
    const at = randomLand(g, t => t === GRASS || (race === 'dwarf' && t === HILLS) || (race === 'elf' && t === ENCHANTED))
      ?? randomLand(g)
    if (at === null) continue
    for (let i = 0; i < 6; i++) spawnNear(g, race, at[0], at[1], 2)
  }
  for (let i = 0; i < 18; i++) {
    const at = randomLand(g, t => t === GRASS)
    if (at !== null) spawnNear(g, rnd() < 0.7 ? 'sheep' : 'chicken', at[0], at[1], 1)
  }
  for (let i = 0; i < 4; i++) {
    const at = randomLand(g, t => t === FOREST || t === SNOW)
    if (at !== null) spawnNear(g, rnd() < 0.7 ? 'wolf' : 'bear', at[0], at[1], 1)
  }
}

// -------------------------------------------------------------- units ---

function applyTraits(u: Unit) {
  const base = KINDS[u.k]
  const has = (t: Trait) => u.traits.includes(t)
  let max = base.hp, dmg = base.dmg, arm = base.arm, spd = base.spd
  if (has('giant')) { max *= 1.6; dmg += 2 }
  if (has('strong')) dmg += 3
  if (has('weak')) dmg = Math.max(1, dmg - 2)
  if (has('frail')) max *= 0.7
  if (has('fast')) spd += 1
  if (has('slow')) spd -= 1
  const ratio = u.max > 0 ? u.hp / u.max : 1
  u.max = Math.round(max)
  u.hp = Math.max(1, Math.round(u.max * ratio))
  u.dmg = base.dmg === 0 ? 0 : dmg
  u.arm = arm
  u.spd = Math.max(1, Math.min(3, spd))
}

function walkable(g: Game, u: Unit, x: number, y: number): boolean {
  if (!inBounds(x, y)) return false
  if (KINDS[u.k].fly) return true
  const t = g.terrain[y * W + x] ?? DEEP
  if (isWater(t)) return false
  if (t === LAVA) return u.k === 'demon'
  if (t === MOUNTAIN) return u.k === 'dwarf' || u.k === 'demon' || u.k === 'bear'
  return true
}

function spawn(g: Game, k: Kind, x: number, y: number, parent?: Unit, limit = MAX_UNITS): Unit | null {
  if (g.units.length >= limit || !inBounds(x, y)) return null
  const info = KINDS[k]
  const u: Unit = {
    id: g.nextId++, k, x, y, hp: info.hp, max: info.hp, dmg: info.dmg, arm: info.arm, spd: info.spd,
    age: parent ? 0 : isRace(k) ? 16 + ri(14) : ri(3), life: Math.round(info.life * (0.8 + rnd() * 0.4)),
    traits: [], kd: parent?.kd ?? -1, name: isRace(k) ? nameFor(k) : info.label,
    sick: 0, mad: 0, tgt: -1, tx: -1, ty: -1, mode: 0, cd: ri(3),
  }
  if (isRace(k)) {
    if (k === 'orc') u.traits.push('regenerates')
    for (const t of parent?.traits ?? []) if (rnd() < 0.5 && !u.traits.includes(t)) u.traits.push(t)
    if (rnd() < 0.35) {
      const t = rnd() < 0.75 ? pick(GOOD_TRAITS) : pick(BAD_TRAITS)
      if (!u.traits.includes(t)) u.traits.push(t)
    }
  }
  if (k === 'demon') u.traits.push('fire_proof')
  if (u.traits.includes('wise')) u.life = Math.round(u.life * 1.5)
  applyTraits(u)
  u.hp = u.max
  if (!walkable(g, u, x, y)) return null
  g.units.push(u)
  g.byId.set(u.id, u)
  return u
}

function spawnNear(g: Game, k: Kind, x: number, y: number, r: number, limit = MAX_UNITS): Unit | null {
  for (let i = 0; i < 12; i++) {
    const u = spawn(g, k, x + ri(r * 2 + 1) - r, y + ri(r * 2 + 1) - r, undefined, limit)
    if (u !== null) return u
  }
  return null
}

function rebuildIndex(g: Game) {
  g.head.fill(-1)
  if (g.nextIdx.length < g.units.length) g.nextIdx = new Int32Array(g.units.length + 64)
  g.byId.clear()
  g.units.forEach((u, i) => {
    const c = u.y * W + u.x
    g.nextIdx[i] = g.head[c] ?? -1
    g.head[c] = i
    g.byId.set(u.id, u)
  })
}

function nearest(g: Game, u: Unit, r: number, ok: (v: Unit) => boolean): Unit | null {
  let best: Unit | null = null, bd = 1e9
  for (let y = Math.max(0, u.y - r); y <= Math.min(H - 1, u.y + r); y++) {
    for (let x = Math.max(0, u.x - r); x <= Math.min(W - 1, u.x + r); x++) {
      for (let i = g.head[y * W + x] ?? -1; i >= 0; i = g.nextIdx[i] ?? -1) {
        const v = g.units[i]
        if (v === undefined || v === u || v.hp <= 0 || !ok(v)) continue
        const d = dist(u.x, u.y, v.x, v.y)
        if (d < bd) { bd = d; best = v }
      }
    }
  }
  return best
}

function unitsIn(g: Game, x: number, y: number, r: number): Unit[] {
  return g.units.filter(u => u.hp > 0 && (u.x - x) ** 2 + (u.y - y) ** 2 <= r * r + r)
}

function stepToward(g: Game, u: Unit, tx: number, ty: number, away = false) {
  let dx = Math.sign(tx - u.x), dy = Math.sign(ty - u.y)
  if (away) { dx = -dx; dy = -dy }
  const tries: (readonly [number, number])[] = [[dx, dy], [dx, 0], [0, dy]]
  for (let i = 0; i < 3; i++) tries.push(pick(DIRS))
  for (const [ax, ay] of tries) {
    if ((ax !== 0 || ay !== 0) && walkable(g, u, u.x + ax, u.y + ay)) { u.x += ax; u.y += ay; return }
  }
}

function wander(g: Game, u: Unit) {
  if (rnd() < 0.6) {
    const [dx, dy] = pick(DIRS)
    if (walkable(g, u, u.x + dx, u.y + dy)) { u.x += dx; u.y += dy }
  }
}

function hurt(g: Game, v: Unit, amount: number, by?: Unit) {
  if (v.traits.includes('lucky') && rnd() < 0.25) return
  v.hp -= Math.max(1, amount - v.arm)
  if (v.hp <= 0 && by?.k === 'zombie' && isRace(v.k) && !v.traits.includes('immune')) {
    // Bitten to death: rises again as one of them.
    zombify(v)
  }
}

function zombify(v: Unit) {
  v.k = 'zombie'; v.kd = -1; v.traits = v.traits.filter(t => t !== 'regenerates'); v.mad = 0; v.sick = 0
  v.max = 0; applyTraits(v); v.hp = v.max
}

function strikeOrApproach(g: Game, u: Unit, v: Unit) {
  if (dist(u.x, u.y, v.x, v.y) <= 1) {
    const k = u.kd >= 0 ? g.kingdoms[u.kd] : undefined
    hurt(g, v, u.dmg + (k?.tech ?? 0), u)
  } else stepToward(g, u, v.x, v.y)
}

const atWar = (g: Game, a: number, b: number) => a >= 0 && b >= 0 && a !== b && (g.kingdoms[a]?.war.includes(b) ?? false)

function hostile(g: Game, u: Unit, v: Unit): boolean {
  if (u.mad > 0) return true
  if (isMonster(v.k) && v.k !== 'ufo') return true
  if (isRace(v.k) && v.mad > 0) return true
  return isRace(v.k) && atWar(g, u.kd, v.kd)
}

function canAct(g: Game, u: Unit): boolean {
  if (u.cd > 0) { u.cd--; return false }
  u.cd = 3 - u.spd
  return true
}

function act(g: Game, u: Unit) {
  const i = u.y * W + u.x
  const t = g.terrain[i] ?? DEEP
  const fly = KINDS[u.k].fly === true
  const fireProof = u.traits.includes('fire_proof')
  if (!fly && (isWater(t) || (t === LAVA && u.k !== 'demon'))) {
    u.hp -= t === LAVA ? 12 : 3
    for (const [dx, dy] of DIRS) if (walkable(g, u, u.x + dx, u.y + dy)) { u.x += dx; u.y += dy; break }
  }
  if ((g.fire[i] ?? 0) > 0 && !fireProof) u.hp -= 3
  if (u.traits.includes('regenerates') && u.hp < u.max) u.hp = Math.min(u.max, u.hp + 0.12)
  if (t === ENCHANTED && u.hp < u.max) u.hp = Math.min(u.max, u.hp + 0.2)
  if (u.mad > 0) u.mad--
  if (u.sick > 0) {
    u.sick++
    u.hp -= 0.18
    if (rnd() < 0.08) {
      const v = nearest(g, u, 1, w => w.sick === 0 && (isRace(w.k) || isPrey(w.k)) && !w.traits.includes('immune'))
      if (v !== null) v.sick = 1
    }
    if (u.sick > 160 && rnd() < 0.02) u.sick = 0
  }
  if (!canAct(g, u)) return

  switch (u.k) {
    case 'human': case 'elf': case 'orc': case 'dwarf': return civAct(g, u)
    case 'sheep': case 'chicken': {
      const threat = nearest(g, u, 3, v => v.k === 'wolf' || v.k === 'bear' || v.k === 'zombie')
      if (threat !== null) return stepToward(g, u, threat.x, threat.y, true)
      return wander(g, u)
    }
    case 'wolf': case 'bear': {
      if (u.tgt < 0 || (g.tick + u.id) % 5 === 0) {
        const prey = nearest(g, u, 7, v => isPrey(v.k) || (isRace(v.k) && (u.k === 'bear' || rnd() < 0.3)))
        u.tgt = prey?.id ?? -1
      }
      const prey = g.byId.get(u.tgt)
      if (prey !== undefined && prey.hp > 0) return strikeOrApproach(g, u, prey)
      u.tgt = -1
      return wander(g, u)
    }
    case 'zombie': {
      if (u.tgt < 0 || (g.tick + u.id) % 4 === 0) u.tgt = nearest(g, u, 8, v => v.k !== 'zombie' && !isMonster(v.k))?.id ?? -1
      const v = g.byId.get(u.tgt)
      if (v !== undefined && v.hp > 0) return strikeOrApproach(g, u, v)
      return wander(g, u)
    }
    case 'dragon': {
      if ((g.tick + u.id) % 26 === 0) {
        const v = nearest(g, u, 6, w => isRace(w.k) || isPrey(w.k))
        if (v !== null) breathe(g, v.x, v.y)
      }
      const v = nearest(g, u, 2, w => isRace(w.k))
      if (v !== null && rnd() < 0.5) return strikeOrApproach(g, u, v)
      if (u.tx < 0 || dist(u.x, u.y, u.tx, u.ty) < 2) { u.tx = ri(W); u.ty = ri(H) }
      stepToward(g, u, u.tx, u.ty)
      return
    }
    case 'demon': {
      if (rnd() < 0.05) ignite(g, u.x + ri(3) - 1, u.y + ri(3) - 1)
      if (u.tgt < 0 || (g.tick + u.id) % 6 === 0) u.tgt = nearest(g, u, 7, v => isRace(v.k))?.id ?? -1
      const v = g.byId.get(u.tgt)
      if (v !== undefined && v.hp > 0) return strikeOrApproach(g, u, v)
      return wander(g, u)
    }
    case 'ufo': {
      u.age += 1 / TICKS_PER_YEAR
      if (u.age > 14) { u.hp = 0; log(g, 'The UFO leaves for the stars.'); return }
      if ((g.tick + u.id) % 30 === 0) {
        const v = nearest(g, u, 2, w => w.k !== 'ufo' && w.k !== 'dragon')
        if (v !== null) {
          v.hp = -999
          g.fx.push({ kind: 'magic', x: v.x, y: v.y, r: 0, ttl: 4 })
          if (isRace(v.k)) log(g, `${v.name} the ${KINDS[v.k].label} was abducted by a UFO!`)
        }
      }
      if (u.tx < 0 || dist(u.x, u.y, u.tx, u.ty) < 2) { u.tx = ri(W); u.ty = ri(H) }
      stepToward(g, u, u.tx, u.ty)
      return
    }
  }
}

function civAct(g: Game, u: Unit) {
  if (u.mad > 0) {
    const v = nearest(g, u, 6, () => true)
    return v !== null ? strikeOrApproach(g, u, v) : wander(g, u)
  }
  if (u.kd < 0 || !(g.kingdoms[u.kd]?.alive ?? false)) {
    u.kd = -1
    joinOrFound(g, u)
    if (u.kd < 0) return wander(g, u)
  }
  const k = g.kingdoms[u.kd] as Kingdom
  const warrior = u.traits.includes('bloodlust') || u.id % (u.k === 'orc' ? 2 : 3) === 0
  if (u.tgt < 0 || (g.tick + u.id) % 4 === 0) {
    u.tgt = nearest(g, u, warrior ? 9 : 4, v => hostile(g, u, v))?.id ?? -1
  }
  const enemy = g.byId.get(u.tgt)
  if (enemy !== undefined && enemy.hp > 0) {
    if (warrior || dist(u.x, u.y, enemy.x, enemy.y) <= 1 || enemy.k === 'sheep') return strikeOrApproach(g, u, enemy)
    return stepToward(g, u, enemy.x, enemy.y, true)
  }
  u.tgt = -1
  if (warrior && k.war.length > 0) {
    if (u.mode !== 1 || (g.tick + u.id) % 8 === 0) {
      const h = nearestHouse(g, u.x, u.y, 14, kd => atWar(g, u.kd, kd))
      if (h !== null) { u.mode = 1; u.tx = h[0]; u.ty = h[1] } else if (u.mode === 1) { u.mode = 0; u.tx = -1 }
    }
    if (u.mode === 1) {
      const hi = u.ty * W + u.tx
      if ((g.house[hi] ?? 0) === 0) { u.mode = 0; u.tx = -1; return }
      if (dist(u.x, u.y, u.tx, u.ty) <= 1) {
        damageHouse(g, hi, u.dmg + k.tech)
        if (rnd() < 0.04) ignite(g, u.tx, u.ty)
      } else stepToward(g, u, u.tx, u.ty)
      return
    }
  }
  u.mode = 0
  if (u.tx < 0 || dist(u.x, u.y, u.tx, u.ty) === 0) {
    if (u.tx >= 0) work(g, u, k)
    const home = randomHouse(g, k)
    const tx = home[0] + ri(13) - 6, ty = home[1] + ri(13) - 6
    if (walkable(g, u, tx, ty)) { u.tx = tx; u.ty = ty } else u.tx = -1
    return
  }
  stepToward(g, u, u.tx, u.ty)
  if (rnd() < 0.05) u.tx = -1
}

function work(g: Game, u: Unit, k: Kingdom) {
  const i = u.y * W + u.x
  const t = g.terrain[i] ?? GRASS
  if (t === FOREST || t === ENCHANTED) {
    k.wood += u.k === 'elf' ? 2 : 1
    if (t === FOREST && u.k !== 'elf' && rnd() < 0.08) g.terrain[i] = GRASS
  } else if (t === HILLS || t === MOUNTAIN) {
    k.stone += u.k === 'dwarf' ? 3 : 1
  } else if (t === GRASS || t === SWAMP) {
    k.food += 2
  } else if (t === SAND || t === DESERT || t === SNOW || t === SCORCHED) {
    if (rnd() < 0.5) k.food += 1
  }
  if (u.traits.includes('genius')) k.research += 1
}

function joinOrFound(g: Game, u: Unit) {
  const race = u.k as Race
  let best: Kingdom | null = null, bd = 24
  for (const k of g.kingdoms) {
    if (!k.alive || k.race !== race) continue
    const d = dist(u.x, u.y, k.cx, k.cy)
    if (d < bd) { bd = d; best = k }
  }
  if (best !== null) { u.kd = best.id; return }
  const i = u.y * W + u.x
  const t = g.terrain[i] ?? DEEP
  if (!BUILDABLE.has(t) || (g.house[i] ?? 0) !== 0) return
  const k = foundKingdom(g, race, u.x, u.y)
  u.kd = k.id
  k.king = u.id
  placeHouse(g, k, u.x, u.y)
  log(g, `${u.name} founds the ${KINDS[race].label.toLowerCase()} kingdom of ${k.name}.`)
}

function foundKingdom(g: Game, race: Race, x: number, y: number): Kingdom {
  const used = new Set(g.kingdoms.filter(k => k.alive).map(k => k.color))
  const color = KINGDOM_COLORS.find(c => !used.has(c)) ?? pick(KINGDOM_COLORS)
  const k: Kingdom = {
    id: g.kingdoms.length, race, name: nameFor(race).slice(0, 6) + pick(REALM_SUFFIX[race]), color, cx: x, cy: y,
    wood: 6, stone: 0, food: 8, tech: 0, research: 0, king: -1, rel: {}, war: [], weary: {},
    alive: true, founded: g.tick, pop: 1, houses: 0,
  }
  for (const o of g.kingdoms) {
    if (!o.alive) continue
    const r = affinity(race, o.race) + ri(21) - 10
    k.rel[o.id] = r
    o.rel[k.id] = r
  }
  g.kingdoms.push(k)
  return k
}

function affinity(a: Race, b: Race): number {
  if (a === b) return 30
  const pair = [a, b].sort().join('-')
  const table: Record<string, number> = {
    'dwarf-human': 15, 'elf-human': 10, 'dwarf-elf': -15, 'elf-orc': -55, 'human-orc': -35, 'dwarf-orc': -40,
  }
  return table[pair] ?? 0
}

function placeHouse(g: Game, k: Kingdom, x: number, y: number) {
  const i = y * W + x
  if (g.terrain[i] === FOREST) g.terrain[i] = GRASS
  g.house[i] = k.id + 1
  g.hhp[i] = HOUSE_HP
  g.fire[i] = 0
}

function damageHouse(g: Game, i: number, amount: number) {
  const hp = (g.hhp[i] ?? 0) - amount
  if (hp <= 0) { g.house[i] = 0; g.hhp[i] = 0 } else g.hhp[i] = hp
}

function nearestHouse(g: Game, x: number, y: number, r: number, ok: (kd: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null, bd = 1e9
  for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) {
      const h = g.house[yy * W + xx] ?? 0
      if (h === 0 || !ok(h - 1)) continue
      const d = dist(x, y, xx, yy)
      if (d < bd) { bd = d; best = [xx, yy] }
    }
  }
  return best
}

function randomHouse(g: Game, k: Kingdom): [number, number] {
  for (let n = 0; n < 6; n++) {
    const x = k.cx + ri(17) - 8, y = k.cy + ri(17) - 8
    if (inBounds(x, y) && g.house[y * W + x] === k.id + 1) return [x, y]
  }
  return [k.cx, k.cy]
}

// ---------------------------------------------------------- kingdoms ---

function kingdomsQuarter(g: Game) {
  const houses: [number, number][][] = g.kingdoms.map(() => [])
  g.territory.fill(0)
  for (let i = 0; i < W * H; i++) {
    const h = g.house[i] ?? 0
    if (h === 0) continue
    houses[h - 1]?.push([i % W, Math.floor(i / W)])
  }
  for (const k of g.kingdoms) k.pop = 0
  for (const u of g.units) if (u.kd >= 0 && isRace(u.k)) { const k = g.kingdoms[u.kd]; if (k) k.pop++ }

  for (const k of g.kingdoms) {
    if (!k.alive) continue
    const own = houses[k.id] ?? []
    k.houses = own.length
    for (const [x, y] of own) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (inBounds(x + dx, y + dy)) g.territory[(y + dy) * W + x + dx] = k.id + 1
      }
    }
    if (k.pop === 0 && k.houses === 0) {
      k.alive = false
      log(g, `The kingdom of ${k.name} has fallen.`)
      for (const o of g.kingdoms) o.war = o.war.filter(id => id !== k.id)
      continue
    }
    if (k.pop === 0) {
      // Empty houses crumble.
      for (const [x, y] of own) if (rnd() < 0.2) damageHouse(g, y * W + x, 30)
      continue
    }
    if (g.house[k.cy * W + k.cx] !== k.id + 1 && own.length > 0) {
      const [x, y] = pick(own)
      k.cx = x; k.cy = y
    }
    // Build.
    if (k.wood >= 4 && k.houses * 3 < k.pop + 3) {
      for (let n = 0; n < 12; n++) {
        const [bx, by] = own.length > 0 ? pick(own) : [k.cx, k.cy]
        const x = bx + ri(7) - 3, y = by + ri(7) - 3
        const i = y * W + x
        const t = g.terrain[i] ?? DEEP
        if (!inBounds(x, y) || (g.house[i] ?? 0) !== 0 || (g.fire[i] ?? 0) > 0) continue
        if (!(BUILDABLE.has(t) || (k.race === 'dwarf' && t === MOUNTAIN))) continue
        if (own.length === 0) { k.cx = x; k.cy = y }
        placeHouse(g, k, x, y)
        k.wood -= 4
        k.houses++
        break
      }
    }
    // Births.
    const members = g.units.filter(u => u.kd === k.id && isRace(u.k))
    if (k.food >= 6 && k.pop < Math.max(2, k.houses * 4) && own.length > 0) {
      const parent = pick(members)
      const [x, y] = pick(own)
      const child = spawnNear(g, k.race, x, y, 1)
      if (child !== null) {
        child.kd = k.id
        child.age = 0
        for (const t of parent?.traits ?? []) if (rnd() < 0.5 && !child.traits.includes(t)) child.traits.push(t)
        applyTraits(child)
        k.food -= 6
      }
    }
    // Research.
    if (k.stone >= 10) { k.stone -= 10; k.research += 4 }
    k.research += 1
    if (k.research >= 60 * (k.tech + 1) && k.tech < AGES.length - 1) {
      k.research = 0
      k.tech++
      log(g, `${k.name} enters the ${AGES[k.tech]}.`)
    }
    // A crown for the strongest when the throne is empty.
    const king = g.byId.get(k.king)
    if (king === undefined || king.hp <= 0 || king.kd !== k.id) {
      const heir = members.filter(u => u.age >= 16).sort((a, b) => b.max + b.dmg * 5 - (a.max + a.dmg * 5))[0]
      if (heir !== undefined) {
        k.king = heir.id
        log(g, `${heir.name} is crowned ruler of ${k.name}.`)
      } else k.king = -1
    }
  }
}

function kingdomsYear(g: Game) {
  const alive = g.kingdoms.filter(k => k.alive)
  for (const a of alive) {
    for (const b of alive) {
      if (b.id <= a.id) continue
      let r = a.rel[b.id] ?? affinity(a.race, b.race)
      r += (affinity(a.race, b.race) - r) * 0.05 + ri(13) - 6
      if (dist(a.cx, a.cy, b.cx, b.cy) < 28) r -= 4
      if (atWar(g, a.id, b.id)) {
        const w = (a.weary[b.id] ?? 0) + 1
        a.weary[b.id] = w
        if (w >= 4 && rnd() < 0.3) {
          makePeace(g, a, b)
          r = Math.max(r, -10) + 25
        }
      } else if (r < -40 && rnd() < 0.35 && year(g) - Math.floor(Math.max(a.founded, b.founded) / TICKS_PER_YEAR) > 2) {
        declareWar(g, a, b)
      }
      r = Math.max(-100, Math.min(100, r))
      a.rel[b.id] = r
      b.rel[a.id] = r
    }
  }
  // Rebellion: a sprawling realm, or one without a ruler, may split.
  for (const k of alive) {
    const kingless = !g.byId.has(k.king)
    if (!(k.houses >= 16 && rnd() < 0.12) && !(kingless && k.houses >= 8 && rnd() < 0.25)) continue
    let far: [number, number] | null = null, fd = 10
    for (let i = 0; i < W * H; i++) {
      if (g.house[i] !== k.id + 1) continue
      const x = i % W, y = Math.floor(i / W), d = dist(x, y, k.cx, k.cy)
      if (d > fd) { fd = d; far = [x, y] }
    }
    if (far === null) continue
    const rebel = foundKingdom(g, k.race, far[0], far[1])
    for (let i = 0; i < W * H; i++) {
      if (g.house[i] === k.id + 1 && dist(i % W, Math.floor(i / W), far[0], far[1]) <= 7) g.house[i] = rebel.id + 1
    }
    for (const u of g.units) if (u.kd === k.id && dist(u.x, u.y, far[0], far[1]) <= 8 && u.id !== k.king) u.kd = rebel.id
    rebel.wood = Math.floor(k.wood / 3)
    rebel.tech = k.tech
    rebel.rel[k.id] = -100
    k.rel[rebel.id] = -100
    log(g, `Rebellion! ${rebel.name} breaks away from ${k.name}.`)
    declareWar(g, rebel, k, true)
  }
  // Ageing.
  for (const u of g.units) {
    if (u.k === 'ufo') continue
    u.age++
    if (u.age > u.life) {
      u.hp = 0
      if (isRace(u.k) && g.kingdoms[u.kd]?.king === u.id) log(g, `${u.name} of ${g.kingdoms[u.kd]?.name} dies of old age.`)
    }
  }
  // Wildlife.
  const count = (k: Kind) => g.units.filter(u => u.k === k).length
  const sheep = count('sheep') + count('chicken')
  for (const u of [...g.units]) {
    if (isPrey(u.k) && sheep < 90 && rnd() < 0.35 && g.terrain[u.y * W + u.x] === GRASS) spawnNear(g, u.k, u.x, u.y, 1)
    else if (u.k === 'wolf' && count('wolf') < 24 && sheep > 10 && rnd() < 0.15) spawnNear(g, 'wolf', u.x, u.y, 1)
    else if (u.k === 'bear' && count('bear') < 10 && rnd() < 0.05) spawnNear(g, 'bear', u.x, u.y, 1)
  }
}

function declareWar(g: Game, a: Kingdom, b: Kingdom, quiet = false) {
  if (a.war.includes(b.id)) return
  a.war.push(b.id); b.war.push(a.id)
  a.weary[b.id] = 0; b.weary[a.id] = 0
  if (!quiet) log(g, `War! ${a.name} declares war on ${b.name}.`)
  for (const c of g.kingdoms) {
    if (!c.alive || c.id === a.id || c.id === b.id || c.war.includes(a.id)) continue
    if ((c.rel[b.id] ?? 0) > 55) {
      c.war.push(a.id); a.war.push(c.id)
      log(g, `${c.name} joins the war at the side of its ally ${b.name}.`)
    }
  }
}

function makePeace(g: Game, a: Kingdom, b: Kingdom) {
  a.war = a.war.filter(id => id !== b.id)
  b.war = b.war.filter(id => id !== a.id)
  log(g, `${a.name} and ${b.name} make peace.`)
}

// -------------------------------------------------------------- tiles ---

function ignite(g: Game, x: number, y: number) {
  if (!inBounds(x, y)) return
  const i = y * W + x
  const t = g.terrain[i] ?? DEEP
  if (isWater(t) || t === ICE) return
  g.fire[i] = 10 + ri(10)
}

function breathe(g: Game, x: number, y: number) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (rnd() < 0.8) ignite(g, x + dx, y + dy)
  for (const v of unitsIn(g, x, y, 1)) if (v.k !== 'dragon' && !v.traits.includes('fire_proof')) hurt(g, v, 18)
  g.fx.push({ kind: 'boom', x, y, r: 1, ttl: 3 })
}

function tiles(g: Game) {
  // Fire burns down, spreads, and leaves scorched earth.
  for (let i = 0; i < W * H; i++) {
    const f = g.fire[i] ?? 0
    if (f === 0) continue
    const x = i % W, y = Math.floor(i / W)
    const t = g.terrain[i] ?? DEEP
    if (isWater(t) || t === ICE) { g.fire[i] = 0; continue }
    if ((g.house[i] ?? 0) !== 0) damageHouse(g, i, 6)
    if (rnd() < 0.5) {
      const [dx, dy] = pick(DIRS)
      const j = (y + dy) * W + x + dx
      if (inBounds(x + dx, y + dy) && (g.fire[j] ?? 0) === 0) {
        const nt = g.terrain[j] ?? DEEP
        const chance = (g.house[j] ?? 0) !== 0 ? 0.3 : FLAMMABLE[nt] ?? 0
        if (rnd() < chance * 3) ignite(g, x + dx, y + dy)
      }
    }
    g.fire[i] = f - 1
    if (f === 1 && (t === FOREST || t === GRASS || t === ENCHANTED)) g.terrain[i] = SCORCHED
  }
  // A few random tiles change on their own: regrowth, lava, corruption.
  for (let n = 0; n < 500; n++) {
    const x = ri(W), y = ri(H), i = y * W + x
    const t = g.terrain[i] ?? DEEP
    const [dx, dy] = pick(DIRS)
    const j = (y + dy) * W + x + dx
    const nt = inBounds(x + dx, y + dy) ? g.terrain[j] ?? DEEP : DEEP
    if (t === SCORCHED && (g.fire[i] ?? 0) === 0 && rnd() < 0.03) g.terrain[i] = GRASS
    else if (t === GRASS && nt === FOREST && rnd() < 0.04 && (g.house[i] ?? 0) === 0) g.terrain[i] = FOREST
    else if (t === LAVA) {
      if (isWater(nt) || nt === ICE || nt === SNOW) { g.terrain[i] = MOUNTAIN; if (nt !== SNOW) g.terrain[j] = SHALLOW }
      else if (rnd() < 0.25) ignite(g, x + dx, y + dy)
      if (rnd() < 0.02) g.terrain[i] = MOUNTAIN
    } else if (t === CORRUPTED) {
      if (!isWater(nt) && nt !== CORRUPTED && nt !== MOUNTAIN && rnd() < 0.05) g.terrain[j] = CORRUPTED
      if (rnd() < 0.002 && g.units.filter(u => u.k === 'demon').length < 6) {
        const d = spawn(g, 'demon', x, y)
        if (d !== null) log(g, 'A demon claws its way out of the corrupted land.')
      }
    } else if (t === ICE && nt === LAVA) g.terrain[i] = SHALLOW
  }
}

function fxStep(g: Game) {
  for (const f of g.fx) {
    f.ttl--
    if (f.kind === 'rain') {
      for (let n = 0; n < 6; n++) {
        const x = f.x + ri(f.r * 2 + 1) - f.r, y = f.y + ri(f.r * 2 + 1) - f.r
        if (!inBounds(x, y)) continue
        const i = y * W + x
        g.fire[i] = 0
        const t = g.terrain[i]
        if ((t === SCORCHED || t === DESERT) && rnd() < 0.3) g.terrain[i] = GRASS
        else if (t === GRASS && rnd() < 0.08) g.terrain[i] = FOREST
        else if (t === LAVA && rnd() < 0.3) g.terrain[i] = MOUNTAIN
      }
    } else if (f.kind === 'tornado') {
      const [dx, dy] = pick(DIRS)
      f.x = Math.max(0, Math.min(W - 1, f.x + dx)); f.y = Math.max(0, Math.min(H - 1, f.y + dy))
      for (let yy = f.y - 1; yy <= f.y + 1; yy++) for (let xx = f.x - 1; xx <= f.x + 1; xx++) {
        if (!inBounds(xx, yy)) continue
        const i = yy * W + xx
        if ((g.house[i] ?? 0) !== 0) damageHouse(g, i, 25)
        if (g.terrain[i] === FOREST && rnd() < 0.4) g.terrain[i] = GRASS
        g.fire[i] = 0
      }
      for (const u of unitsIn(g, f.x, f.y, 1)) {
        if (u.k === 'dragon' || u.k === 'ufo') continue
        hurt(g, u, 6)
        const nx = u.x + ri(7) - 3, ny = u.y + ri(7) - 3
        if (inBounds(nx, ny)) { u.x = nx; u.y = ny }
      }
    } else if (f.kind === 'volcano') {
      const r = 1 + ri(3)
      const x = f.x + ri(r * 2 + 1) - r, y = f.y + ri(r * 2 + 1) - r
      if (inBounds(x, y) && rnd() < 0.6) {
        const i = y * W + x
        g.terrain[i] = LAVA; g.house[i] = 0
        for (const [dx, dy] of DIRS) if (rnd() < 0.3) ignite(g, x + dx, y + dy)
      }
    }
  }
  g.fx = g.fx.filter(f => f.ttl > 0)
}

function step(g: Game) {
  g.tick++
  rebuildIndex(g)
  for (const u of g.units) if (u.hp > 0) act(g, u)
  tiles(g)
  fxStep(g)
  if (g.tick % 12 === 0) kingdomsQuarter(g)
  if (g.tick % TICKS_PER_YEAR === 0) kingdomsYear(g)
  const dead = g.units.filter(u => u.hp <= 0)
  if (dead.length > 0) {
    for (const u of dead) {
      const k = g.kingdoms[u.kd]
      if (k?.king === u.id && u.age <= u.life) log(g, `${u.name}, ruler of ${k.name}, has been slain!`)
      if (u.id === g.selected) { g.selected = -1; g.follow = false }
    }
    g.units = g.units.filter(u => u.hp > 0)
  }
}

// -------------------------------------------------------------- tools ---

type Tool = { id: string; label: string; cat: Cat; drag: boolean; apply: (g: Game, x: number, y: number, r: number) => void }

function disc(x: number, y: number, r: number, fn: (x: number, y: number, i: number) => void) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + r || !inBounds(x + dx, y + dy)) continue
    fn(x + dx, y + dy, (y + dy) * W + x + dx)
  }
}

function paint(t: number) {
  return (g: Game, x: number, y: number, r: number) => disc(x, y, r, (_x, _y, i) => {
    g.terrain[i] = t
    g.fire[i] = 0
    if (isWater(t) || t === LAVA || t === MOUNTAIN) g.house[i] = 0
  })
}

function heat(g: Game, x: number, y: number, r: number) {
  disc(x, y, r, (xx, yy, i) => {
    if (rnd() < 0.5) return
    const t = g.terrain[i]
    if (t === ICE) g.terrain[i] = SHALLOW
    else if (t === SNOW) g.terrain[i] = GRASS
    else if (t === SHALLOW && rnd() < 0.3) g.terrain[i] = SAND
    else if (t === GRASS || t === FOREST || t === SWAMP) { g.terrain[i] = DESERT; if (rnd() < 0.3) ignite(g, xx, yy) }
    else if ((t === SAND || t === DESERT || t === MOUNTAIN || t === HILLS || t === SCORCHED) && rnd() < 0.4) { g.terrain[i] = LAVA; g.house[i] = 0 }
  })
}

function cool(g: Game, x: number, y: number, r: number) {
  disc(x, y, r, (_x, _y, i) => {
    if (rnd() < 0.5) return
    g.fire[i] = 0
    const t = g.terrain[i]
    if (t === LAVA) g.terrain[i] = MOUNTAIN
    else if (t === SHALLOW || (t === DEEP && rnd() < 0.3)) g.terrain[i] = ICE
    else if (t === GRASS || t === FOREST || t === SWAMP || t === SCORCHED) g.terrain[i] = SNOW
    else if (t === DESERT) g.terrain[i] = SAND
  })
}

function explode(g: Game, x: number, y: number, r: number, power: number, kind: Fx['kind'] = 'boom') {
  disc(x, y, r, (xx, yy, i) => {
    const t = g.terrain[i] ?? DEEP
    g.house[i] = 0
    if (!isWater(t)) {
      const core = (xx - x) ** 2 + (yy - y) ** 2 <= (r * 0.5) ** 2
      g.terrain[i] = core && r >= 2 ? (t === MOUNTAIN || t === HILLS ? HILLS : r >= 6 ? SHALLOW : SCORCHED) : SCORCHED
      if (rnd() < 0.5) ignite(g, xx, yy)
    }
  })
  for (const u of unitsIn(g, x, y, r)) hurt(g, u, power)
  g.fx.push({ kind, x, y, r, ttl: kind === 'nuke' ? 10 : 4 })
}

function spawnTool(k: Kind) {
  return (g: Game, x: number, y: number, r: number) => {
    const n = KINDS[k].hp >= 100 ? 1 : Math.max(1, r * 2)
    let placed = 0
    for (let i = 0; i < n; i++) {
      // A dragon, demon or UFO lands right where it is dropped; a herd spreads over the brush.
      const u = spawnNear(g, k, x, y, KINDS[k].hp >= 100 ? 0 : r, MAX_UNITS + GOD_RESERVE)
      if (u === null) continue
      placed++
      if (KINDS[k].hp >= 100) log(g, `A ${KINDS[k].label.toLowerCase()} appears!`)
    }
    // Say why nothing appeared, rather than leave the click unanswered.
    if (placed === 0) {
      g.flash = g.units.length >= MAX_UNITS + GOD_RESERVE
        ? `The world is full (${g.units.length} creatures): remove some life first.`
        : `${KINDS[k].label} can't live there: try land${k === 'dwarf' ? ' or mountains' : ''}.`
      g.flashTtl = 30
    }
  }
}

const TOOLS: Tool[] = [
  { id: 'deep', label: 'Ocean', cat: 'terrain', drag: true, apply: paint(DEEP) },
  { id: 'shallow', label: 'Shallows', cat: 'terrain', drag: true, apply: paint(SHALLOW) },
  { id: 'sand', label: 'Sand', cat: 'terrain', drag: true, apply: paint(SAND) },
  { id: 'grass', label: 'Grass', cat: 'terrain', drag: true, apply: paint(GRASS) },
  { id: 'forest', label: 'Forest', cat: 'terrain', drag: true, apply: paint(FOREST) },
  { id: 'hills', label: 'Hills', cat: 'terrain', drag: true, apply: paint(HILLS) },
  { id: 'mountain', label: 'Mountain', cat: 'terrain', drag: true, apply: paint(MOUNTAIN) },
  { id: 'desert', label: 'Desert', cat: 'terrain', drag: true, apply: paint(DESERT) },
  { id: 'tundra', label: 'Tundra', cat: 'terrain', drag: true, apply: paint(SNOW) },
  { id: 'swamp', label: 'Swamp', cat: 'terrain', drag: true, apply: paint(SWAMP) },
  { id: 'enchanted', label: 'Enchanted', cat: 'terrain', drag: true, apply: paint(ENCHANTED) },
  { id: 'corrupt', label: 'Corrupted', cat: 'terrain', drag: true, apply: paint(CORRUPTED) },
  { id: 'heat', label: 'Heat', cat: 'terrain', drag: true, apply: heat },
  { id: 'cool', label: 'Cool', cat: 'terrain', drag: true, apply: cool },

  { id: 'rain', label: 'Rain', cat: 'nature', drag: true, apply: (g, x, y, r) => g.fx.push({ kind: 'rain', x, y, r: r + 2, ttl: 24 }) },
  {
    id: 'lightning', label: 'Lightning', cat: 'nature', drag: false, apply: (g, x, y) => {
      for (const u of unitsIn(g, x, y, 1)) hurt(g, u, 45)
      ignite(g, x, y)
      if ((g.house[y * W + x] ?? 0) !== 0) damageHouse(g, y * W + x, 40)
      g.fx.push({ kind: 'flash', x, y, r: 0, ttl: 3 })
    },
  },
  { id: 'fire', label: 'Fire', cat: 'nature', drag: true, apply: (g, x, y, r) => disc(x, y, Math.max(0, r - 1), (xx, yy) => ignite(g, xx, yy)) },
  { id: 'tornado', label: 'Tornado', cat: 'nature', drag: false, apply: (g, x, y) => { g.fx.push({ kind: 'tornado', x, y, r: 1, ttl: 70 }); log(g, 'A tornado touches down.') } },
  {
    id: 'quake', label: 'Earthquake', cat: 'nature', drag: false, apply: (g, x, y) => {
      disc(x, y, 7, (_x, _y, i) => {
        if (rnd() < 0.5 && (g.house[i] ?? 0) !== 0) damageHouse(g, i, 40)
        if (rnd() > 0.25) return
        const t = g.terrain[i] ?? DEEP
        g.terrain[i] = rnd() < 0.15 && !isWater(t) ? SHALLOW : t === HILLS ? MOUNTAIN : isWater(t) ? t : HILLS
        if (isWater(g.terrain[i] ?? DEEP)) g.house[i] = 0
      })
      for (const u of unitsIn(g, x, y, 7)) hurt(g, u, 8)
      log(g, 'The earth shakes!')
    },
  },
  {
    id: 'volcano', label: 'Volcano', cat: 'nature', drag: false, apply: (g, x, y) => {
      disc(x, y, 2, (_x, _y, i) => { g.terrain[i] = MOUNTAIN; g.house[i] = 0 })
      g.terrain[y * W + x] = LAVA
      g.fx.push({ kind: 'volcano', x, y, r: 3, ttl: 60 })
      log(g, 'A volcano erupts!')
    },
  },

  { id: 'human', label: 'Humans', cat: 'life', drag: true, apply: spawnTool('human') },
  { id: 'elf', label: 'Elves', cat: 'life', drag: true, apply: spawnTool('elf') },
  { id: 'orc', label: 'Orcs', cat: 'life', drag: true, apply: spawnTool('orc') },
  { id: 'dwarf', label: 'Dwarves', cat: 'life', drag: true, apply: spawnTool('dwarf') },
  { id: 'sheep', label: 'Sheep', cat: 'life', drag: true, apply: spawnTool('sheep') },
  { id: 'chicken', label: 'Chickens', cat: 'life', drag: true, apply: spawnTool('chicken') },
  { id: 'wolf', label: 'Wolves', cat: 'life', drag: true, apply: spawnTool('wolf') },
  { id: 'bear', label: 'Bears', cat: 'life', drag: true, apply: spawnTool('bear') },
  { id: 'dragon', label: 'Dragon', cat: 'life', drag: false, apply: spawnTool('dragon') },
  { id: 'demon', label: 'Demon', cat: 'life', drag: false, apply: spawnTool('demon') },
  { id: 'ufo', label: 'UFO', cat: 'life', drag: false, apply: spawnTool('ufo') },

  { id: 'dynamite', label: 'Dynamite', cat: 'destroy', drag: true, apply: (g, x, y) => explode(g, x, y, 1, 30) },
  { id: 'bomb', label: 'Bomb', cat: 'destroy', drag: false, apply: (g, x, y) => explode(g, x, y, 3, 70) },
  { id: 'napalm', label: 'Napalm', cat: 'destroy', drag: false, apply: (g, x, y) => { disc(x, y, 5, (xx, yy) => { if (rnd() < 0.7) ignite(g, xx, yy) }); g.fx.push({ kind: 'boom', x, y, r: 5, ttl: 3 }) } },
  { id: 'atomic', label: 'Atomic', cat: 'destroy', drag: false, apply: (g, x, y) => { explode(g, x, y, 9, 999, 'nuke'); disc(x, y, 13, (xx, yy) => { if (rnd() < 0.15) ignite(g, xx, yy) }); log(g, 'An atomic bomb detonates!') } },
  {
    id: 'antimatter', label: 'Antimatter', cat: 'destroy', drag: false, apply: (g, x, y) => {
      disc(x, y, 6, (_x, _y, i) => { g.terrain[i] = DEEP; g.house[i] = 0; g.fire[i] = 0 })
      for (const u of unitsIn(g, x, y, 6)) u.hp = -999
      g.fx.push({ kind: 'magic', x, y, r: 6, ttl: 5 })
      log(g, 'Antimatter erases a piece of the world.')
    },
  },

  { id: 'plague', label: 'Plague', cat: 'magic', drag: true, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, r)) if (!u.traits.includes('immune') && !isMonster(u.k)) u.sick = 1; g.fx.push({ kind: 'plague', x, y, r, ttl: 6 }) } },
  {
    id: 'zombie', label: 'Zombies', cat: 'magic', drag: true, apply: (g, x, y, r) => {
      let turned = 0
      for (const u of unitsIn(g, x, y, r)) if (isRace(u.k) && !u.traits.includes('immune')) { zombify(u); turned++ }
      g.fx.push({ kind: 'plague', x, y, r, ttl: 6 })
      if (turned > 0 || spawnNear(g, 'zombie', x, y, r, MAX_UNITS + GOD_RESERVE) !== null) return
      g.flash = "Zombies can't rise there: try land, or people who aren't immune."
      g.flashTtl = 30
    },
  },
  { id: 'madness', label: 'Madness', cat: 'magic', drag: true, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, r)) if (isRace(u.k)) u.mad = 120; g.fx.push({ kind: 'magic', x, y, r, ttl: 5 }) } },
  { id: 'heal', label: 'Healing', cat: 'magic', drag: true, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, r)) { u.hp = u.max; u.sick = 0; u.mad = 0 } g.fx.push({ kind: 'heal', x, y, r, ttl: 6 }) } },
  { id: 'bless', label: 'Blessing', cat: 'magic', drag: false, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, r)) addTrait(u, pick(GOOD_TRAITS)); g.fx.push({ kind: 'heal', x, y, r, ttl: 6 }) } },
  { id: 'curse', label: 'Curse', cat: 'magic', drag: false, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, r)) addTrait(u, pick(BAD_TRAITS)); g.fx.push({ kind: 'magic', x, y, r, ttl: 6 }) } },

  { id: 'inspect', label: 'Inspect', cat: 'inspect', drag: false, apply: (g, x, y) => inspect(g, x, y) },
  { id: 'erase', label: 'Remove life', cat: 'inspect', drag: true, apply: (g, x, y, r) => { for (const u of unitsIn(g, x, y, Math.max(0, r - 1))) u.hp = -999 } },
]

const CATS: [Cat, string][] = [['terrain', 'Terrain'], ['nature', 'Nature'], ['life', 'Life'], ['destroy', 'Destroy'], ['magic', 'Magic'], ['inspect', 'Inspect']]

function addTrait(u: Unit, t: Trait) {
  if (!isRace(u.k) || u.traits.includes(t)) return
  u.traits.push(t)
  if (t === 'wise') u.life = Math.round(u.life * 1.5)
  applyTraits(u)
}

function removeTrait(u: Unit, t: Trait) {
  u.traits = u.traits.filter(x => x !== t)
  if (t === 'wise') u.life = Math.round(u.life / 1.5)
  applyTraits(u)
}

function inspect(g: Game, x: number, y: number) {
  let best: Unit | null = null, bd = 3
  for (const u of g.units) {
    const d = dist(u.x, u.y, x, y)
    if (u.hp > 0 && d < bd) { bd = d; best = u }
  }
  g.selected = best?.id ?? -1
  if (best === null) {
    const h = g.house[y * W + x] ?? 0
    g.flash = h !== 0 ? `A house of ${g.kingdoms[h - 1]?.name ?? '?'} on ${TERRAIN_NAME[g.terrain[y * W + x] ?? 0]}` : TERRAIN_NAME[g.terrain[y * W + x] ?? 0] ?? ''
    g.flashTtl = 30
  }
}

// --------------------------------------------------------------- saves ---

type Save = { v: 1; tick: number; terrain: string; houses: number[]; units: (string | number)[][]; kingdoms: Kingdom[]; log: string[]; nextId: number }

function toSave(g: Game): Save {
  const houses: number[] = []
  for (let i = 0; i < W * H; i++) if ((g.house[i] ?? 0) !== 0) houses.push(i, g.house[i] ?? 0, g.hhp[i] ?? 0)
  return {
    v: 1, tick: g.tick, nextId: g.nextId, log: g.log.slice(-30),
    terrain: String.fromCharCode(...Array.from(g.terrain, t => 65 + t)),
    houses,
    units: g.units.map(u => [u.id, u.k, u.x, u.y, Math.round(u.hp), u.age, u.life, u.kd, u.name,
      u.traits.reduce((m, t) => m | (1 << TRAITS.indexOf(t)), 0), u.sick, u.mad]),
    kingdoms: g.kingdoms,
  }
}

function fromSave(g: Game, frozen: Save) {
  // Props arrive frozen; the world needs its own copy to live in.
  const s = JSON.parse(JSON.stringify(frozen)) as Save
  if (s.v !== 1 || s.terrain.length !== W * H) return
  for (let i = 0; i < W * H; i++) g.terrain[i] = s.terrain.charCodeAt(i) - 65
  g.house.fill(0); g.hhp.fill(0); g.fire.fill(0)
  for (let n = 0; n + 2 < s.houses.length; n += 3) { g.house[s.houses[n] ?? 0] = s.houses[n + 1] ?? 0; g.hhp[s.houses[n] ?? 0] = s.houses[n + 2] ?? 0 }
  g.kingdoms = s.kingdoms
  g.units = []
  for (const r of s.units) {
    const [id, k, x, y, hp, age, life, kd, name, bits, sick, mad] = r as [number, Kind, number, number, number, number, number, number, string, number, number, number]
    if (!(k in KINDS)) continue
    const u: Unit = { id, k, x, y, hp, max: 0, dmg: 0, arm: 0, spd: 1, age, life, kd, name, traits: TRAITS.filter((_t, b) => (bits & (1 << b)) !== 0), sick, mad, tgt: -1, tx: -1, ty: -1, mode: 0, cd: 0 }
    applyTraits(u)
    u.hp = Math.min(hp, u.max)
    g.units.push(u)
  }
  g.tick = s.tick; g.nextId = s.nextId; g.log = s.log; g.fx = []; g.selected = -1; g.follow = false
  rebuildIndex(g)
  kingdomsQuarter(g)
  log(g, 'The world is restored from a save.')
}

// -------------------------------------------------------------- input ---

const toolOf = (g: Game) => TOOLS.find(t => t.id === g.tool) ?? (TOOLS[0] as Tool)

function tileAt(g: Game, px: number, py: number): [number, number] | null {
  if (g.desktop) {
    if (g.cols <= 0 || g.rows <= 0 || px < 0 || py < 0 || px >= g.cols || py >= g.rows) return null
    const x = g.camX + Math.floor(((px + 0.5) * desktopVw(g)) / g.cols), y = g.camY + Math.floor(((py + 0.5) * g.dvh) / g.rows)
    return inBounds(x, y) ? [x, y] : null
  }
  const row = py - g.mapTop
  if (row < 0 || row >= g.mapRows || g.view !== 'map') return null
  const x = g.camX + Math.floor(px / g.drawZoom), y = g.camY + row
  return inBounds(x, y) ? [x, y] : null
}

function onPointer(g: Game, e: ClientPointerEvent): boolean {
  const tile = tileAt(g, e.x, e.y)
  if (e.type === 'leave') { g.hover = null; g.painting = false; g.panning = null; return true }
  if (e.type === 'up') { g.painting = false; g.panning = null; return false }
  if (e.type === 'down' && (e.button === 'right' || e.button === 'middle')) {
    g.panning = { x: e.x, y: e.y, camX: g.camX, camY: g.camY }
    return false
  }
  if (e.type === 'move' && g.panning !== null) {
    g.camX = g.panning.camX - Math.round((e.x - g.panning.x) / g.zoom)
    g.camY = g.panning.camY - (e.y - g.panning.y)
    g.follow = false
    return true
  }
  if (e.type === 'down') {
    if (tile === null) {
      if (g.desktop) return false
      const hit = g.regions.find(r => r.row === e.y && e.x >= r.x0 && e.x < r.x1)
      hit?.act()
      return hit !== undefined
    }
    g.painting = true
    g.lastPaint = -1
  }
  if (e.type === 'move') {
    const was = g.hover
    g.hover = tile === null ? null : { x: tile[0], y: tile[1] }
    if (!g.painting) return was?.x !== g.hover?.x || was?.y !== g.hover?.y
  }
  if (g.painting && tile !== null) {
    const tool = toolOf(g)
    const i = tile[1] * W + tile[0]
    if (e.type === 'move' && (!tool.drag || i === g.lastPaint)) return false
    g.lastPaint = i
    tool.apply(g, tile[0], tile[1], g.brush - 1)
    g.hover = { x: tile[0], y: tile[1] }
    return true
  }
  return false
}

function selectCat(g: Game, cat: Cat) {
  g.cat = cat
  g.view = 'map'
  if (toolOf(g).cat !== cat) g.tool = TOOLS.find(t => t.cat === cat)?.id ?? g.tool
}

function onKey(g: Game, e: ClientKeyEvent, post: (d: JsonValue) => void): boolean {
  const pan = 4
  switch (e.key) {
    case 'left': case 'a': g.camX -= pan; g.follow = false; return true
    case 'right': case 'd': g.camX += pan; g.follow = false; return true
    case 'up': case 'w': g.camY -= pan; g.follow = false; return true
    case 'down': case 's': g.camY += pan; g.follow = false; return true
    case ' ': g.paused = !g.paused; return true
    case '1': g.speed = 1; g.paused = false; return true
    case '2': g.speed = 2; g.paused = false; return true
    case '3': g.speed = 4; g.paused = false; return true
    case 'z': g.zoom = g.zoom === 2 ? 1 : 2; return true
    case '[': g.brush = Math.max(1, g.brush - 1); return true
    case ']': g.brush = Math.min(6, g.brush + 1); return true
    case 'r': g.view = g.view === 'realms' ? 'map' : 'realms'; return true
    case 'b': g.borders = !g.borders; return true
    case 'tab': {
      const i = CATS.findIndex(([c]) => c === g.cat)
      selectCat(g, (CATS[(i + (e.shift ? CATS.length - 1 : 1)) % CATS.length] as [Cat, string])[0])
      return true
    }
    case 'q': case 'e': {
      const tools = TOOLS.filter(t => t.cat === g.cat)
      const i = tools.findIndex(t => t.id === g.tool)
      g.tool = (tools[(i + (e.key === 'e' ? 1 : tools.length - 1)) % tools.length] as Tool).id
      return true
    }
    // On the desktop the next drawing carries these; a post of its own would be replaced by it.
    case 'S': g.outbox.save = true; if (!g.desktop) flush(g, post); return true
    case 'L': g.outbox.load = true; if (!g.desktop) flush(g, post); return true
  }
  return false
}

// -------------------------------------------------------------- drawing ---

type Seg = { text: string; fg?: string; bg?: string; bold?: boolean }
type Item = { text: string; fg?: string; bg?: string; bold?: boolean; act?: () => void }

function pushSeg(row: Seg[], seg: Seg) {
  const s: Seg = seg.text.trim() === '' ? { text: seg.text, bg: seg.bg } : seg
  const last = row[row.length - 1]
  if (last !== undefined && last.bg === s.bg && last.fg === s.fg && last.bold === s.bold) { last.text += s.text; return }
  row.push(s)
}

/** Lays items out left to right, wrapping, and records where each can be clicked. */
function flow(g: Game, items: Item[], cols: number, firstRow: number): Seg[][] {
  const rows: Seg[][] = [[]]
  let x = 0
  for (const it of items) {
    const w = Array.from(it.text).length
    if (x + w > cols && x > 0) { rows.push([]); x = 0 }
    const row = rows[rows.length - 1] as Seg[]
    row.push({ text: it.text, fg: it.fg, bg: it.bg, bold: it.bold })
    if (it.act) g.regions.push({ row: firstRow + rows.length - 1, x0: x, x1: x + w, act: it.act })
    x += w
  }
  return rows
}

function fxGrid(g: Game): Map<number, { ch: string; fg: string; bg?: string }> {
  const m = new Map<number, { ch: string; fg: string; bg?: string }>()
  for (const f of g.fx) {
    switch (f.kind) {
      case 'rain': disc(f.x, f.y, f.r, (x, y, i) => { if ((x + y + g.tick) % 3 === 0) m.set(i, { ch: '/', fg: '#bfe3ff' }) }); break
      case 'flash': m.set(f.y * W + f.x, { ch: '!', fg: '#1a1a1a', bg: '#fff7a8' }); break
      case 'boom': disc(f.x, f.y, f.r, (_x, _y, i) => m.set(i, { ch: '*', fg: '#ffe066', bg: '#e8590c' })); break
      case 'nuke': disc(f.x, f.y, Math.round(f.r * (1.2 - f.ttl / 12)), (_x, _y, i) => m.set(i, { ch: f.ttl > 6 ? ' ' : '░', fg: '#ffd8a8', bg: f.ttl > 6 ? '#fff4e0' : '#f08c00' })); break
      case 'tornado': disc(f.x, f.y, 1, (x, y, i) => m.set(i, { ch: x === f.x && y === f.y ? '@' : '·', fg: '#e9ecef', bg: '#868e96' })); break
      case 'volcano': m.set(f.y * W + f.x, { ch: '▲', fg: '#ffd43b', bg: '#c92a2a' }); break
      case 'heal': disc(f.x, f.y, f.r, (x, y, i) => { if ((x + y) % 2 === 0) m.set(i, { ch: '+', fg: '#8ce99a' }) }); break
      case 'plague': disc(f.x, f.y, f.r, (x, y, i) => { if ((x * 3 + y) % 4 === 0) m.set(i, { ch: '%', fg: '#a9e34b' }) }); break
      case 'magic': disc(f.x, f.y, f.r, (x, y, i) => { if ((x + y + f.ttl) % 2 === 0) m.set(i, { ch: '*', fg: '#e599f7' }) }); break
    }
  }
  return m
}

function unitLook(g: Game, u: Unit): { ch: string; fg: string; bold: boolean } {
  const info = KINDS[u.k]
  const k = u.kd >= 0 ? g.kingdoms[u.kd] : undefined
  const isKing = k?.king === u.id
  let fg = isRace(u.k) && k ? k.color : info.color
  if (u.sick > 0) fg = '#b2f2bb'
  if (u.mad > 0) fg = '#ff66ff'
  return { ch: isKing ? info.ch.toUpperCase() : info.ch, fg, bold: isKing || isMonster(u.k) }
}

/**
 * The map's rows at a level of detail: 3 everything, 2 without terrain
 * texture, 1 also two cells a tile, 0 also half the rows. A Client's tree is
 * held to 100,000 serialized characters, so a big pane steps down.
 */
function mapRowsOf(g: Game, cols: number, rows: number, detail: number): Seg[][] {
  const z: 1 | 2 = detail <= 1 ? 2 : g.zoom
  g.drawZoom = z
  const vw = Math.min(W, Math.floor(cols / z)), vh = Math.min(H, rows)
  const sel = g.byId.get(g.selected)
  if (g.follow && sel !== undefined) { g.camX = sel.x - Math.floor(vw / 2); g.camY = sel.y - Math.floor(vh / 2) }
  g.camX = Math.max(0, Math.min(W - vw, g.camX))
  g.camY = Math.max(0, Math.min(H - vh, g.camY))
  const top = new Int32Array(W * H).fill(-1)
  g.units.forEach((u, i) => {
    if (u.hp <= 0) return
    const c = u.y * W + u.x
    const cur = g.units[top[c] ?? -1]
    if (cur === undefined || isMonster(u.k) || g.kingdoms[u.kd]?.king === u.id) top[c] = i
  })
  const fx = fxGrid(g)
  const brushR = g.brush - 1
  const out: Seg[][] = []
  for (let ty = 0; ty < vh; ty++) {
    const row: Seg[] = []
    const y = g.camY + ty
    for (let tx = 0; tx < vw; tx++) {
      const x = g.camX + tx, i = y * W + x
      const t = g.terrain[i] ?? DEEP
      let bg = TERRAIN_BG[t] as string
      let fg = detail >= 3 ? TERRAIN_FG[t] || undefined : undefined
      let ch = detail >= 3 ? TERRAIN_GLYPH[t] as string : ' '
      let bold = false
      const terr = g.territory[i] ?? 0
      if (g.borders && terr > 0) bg = mix(bg, g.kingdoms[terr - 1]?.color ?? bg, 0.4)
      const h = g.house[i] ?? 0
      if (h !== 0) {
        const k = g.kingdoms[h - 1]
        ch = '⌂'; fg = k?.color ?? '#fff'; bold = true
        if (k && k.cx === x && k.cy === y) { bg = k.color; fg = '#111111' }
      }
      if ((g.fire[i] ?? 0) > 0) { bg = (g.fire[i] ?? 0) % 2 === 0 ? '#c2410c' : '#b02a0a'; ch = '^'; fg = '#ffd43b'; bold = true }
      const ui = top[i] ?? -1
      const u = ui >= 0 ? g.units[ui] : undefined
      if (u !== undefined) { const l = unitLook(g, u); ch = l.ch; fg = l.fg; bold = l.bold }
      const f = fx.get(i)
      if (f !== undefined) { ch = f.ch; fg = f.fg; if (f.bg) bg = f.bg }
      if (sel !== undefined && sel.x === x && sel.y === y) { bg = '#ffffff'; fg = '#000000' }
      else if (g.hover !== null && g.cat !== 'inspect' && (x - g.hover.x) ** 2 + (y - g.hover.y) ** 2 <= brushR * brushR + brushR) bg = mix(bg, '#ffffff', 0.28)
      else if (g.hover !== null && x === g.hover.x && y === g.hover.y) bg = mix(bg, '#ffffff', 0.35)
      pushSeg(row, { text: z === 2 ? ch + ' ' : ch, fg, bg, bold })
    }
    out.push(row)
  }
  return out
}

function realmRows(g: Game, cols: number, rows: number): Seg[][] {
  const out: Seg[][] = []
  const alive = g.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop)
  out.push([{ text: ` Realms of the world (${alive.length})`, bold: true }])
  for (const k of alive.slice(0, Math.max(1, rows - 8))) {
    const wars = k.war.map(id => g.kingdoms[id]?.name).filter(Boolean).join(', ')
    const allies = g.kingdoms.filter(o => o.alive && o.id !== k.id && (k.rel[o.id] ?? 0) > 55).map(o => o.name).join(', ')
    const king = g.byId.get(k.king)
    out.push([
      { text: ' ■ ', fg: k.color },
      { text: `${k.name}`, fg: k.color, bold: true },
      { text: ` ${KINDS[k.race].label.toLowerCase()} · pop ${k.pop} · ⌂${k.houses} · ${AGES[k.tech]}${king ? ` · ruler ${king.name}` : ' · no ruler'}` },
      ...(wars ? [{ text: ` · ⚔ ${wars}`, fg: '#ff8787' }] : []),
      ...(allies ? [{ text: ` · ♥ ${allies}`, fg: '#8ce99a' }] : []),
    ])
  }
  if (alive.length === 0) out.push([{ text: ' No kingdoms yet: drop some humans, elves, orcs or dwarves on land.', fg: '#adb5bd' }])
  out.push([{ text: '' }])
  out.push([{ text: ' Chronicle', bold: true }])
  const room = Math.max(0, rows - out.length)
  for (const line of g.log.slice(-room).reverse()) out.push([{ text: ` ${line}`, fg: '#ced4da' }])
  return out.map(r => r.map(s => ({ ...s, text: s.text.slice(0, cols * 2) })))
}

function infoItems(g: Game): Item[][] {
  const u = g.byId.get(g.selected)
  if (u === undefined || u.hp <= 0) {
    const lines = g.flashTtl > 0 ? [g.flash] : g.log.slice(-2).reverse()
    return lines.map(l => [{ text: ` ${l}`, fg: '#ced4da' }])
  }
  const info = KINDS[u.k]
  const k = u.kd >= 0 ? g.kingdoms[u.kd] : undefined
  const role = k ? (k.king === u.id ? `ruler of ${k.name}` : `of ${k.name}`) : isRace(u.k) ? 'wanderer' : 'wild'
  const status = [u.sick > 0 ? 'sick' : '', u.mad > 0 ? 'mad' : ''].filter(Boolean).join(', ')
  const line1: Item[] = [
    { text: ` ${u.name}`, fg: k?.color ?? info.color, bold: true },
    { text: ` ${info.label.toLowerCase()}, ${role} · age ${Math.floor(u.age)} · ♥ ${Math.ceil(u.hp)}/${u.max} · dmg ${u.dmg + (k?.tech ?? 0)} · arm ${u.arm} · spd ${u.spd}${status ? ` · ${status}` : ''} ` },
  ]
  const line2: Item[] = [{ text: ' traits: ', fg: '#adb5bd' }]
  for (const t of u.traits) {
    const good = GOOD_TRAITS.includes(t)
    line2.push({ text: ` ${t.replace('_', ' ')} ×`, fg: good ? '#8ce99a' : '#ffa8a8', act: () => removeTrait(u, t) })
    line2.push({ text: ' ' })
  }
  if (isRace(u.k)) {
    line2.push({
      text: ' [+ trait] ', fg: '#74c0fc', act: () => {
        const free = TRAITS.filter(t => !u.traits.includes(t))
        if (free.length > 0) addTrait(u, pick(free))
      },
    })
  }
  line2.push({ text: g.follow ? ' [unfollow] ' : ' [follow] ', fg: '#74c0fc', act: () => { g.follow = !g.follow } })
  line2.push({ text: ' [smite] ', fg: '#ffa94d', act: () => { const t = TOOLS.find(x => x.id === 'lightning'); t?.apply(g, u.x, u.y, 0) } })
  line2.push({ text: ' [close] ', fg: '#adb5bd', act: () => { g.selected = -1; g.follow = false } })
  return [line1, line2]
}

// ------------------------------------------------------------ desktop ---

const KIND_ORDER = Object.keys(KINDS) as Kind[]
const FX_ORDER: Fx['kind'][] = ['rain', 'flash', 'boom', 'tornado', 'volcano', 'heal', 'plague', 'magic', 'nuke']

/** A desktop text cell's width over its height: 1ch against 1lh, about 7.8px to 21px. */
const CELL_ASPECT = 0.37

/** Tiles across the desktop's picture at each zoom. */
const desktopVw = (g: Game) => Math.min(W, g.zoom === 2 ? 34 : 60)

function renew(g: Game) {
  const keep = {
    zoom: g.zoom, speed: g.speed, loadedNonce: g.loadedNonce, desktop: g.desktop, dvh: g.dvh, cmdSeq: g.cmdSeq,
    availRows: g.availRows, cols: g.cols, rows: g.rows, outbox: g.outbox, lastFrame: '',
  }
  Object.assign(g, { ...newGame(), ...keep, regions: [] })
}

/** Sends what is waiting: a save, a load request, or the frame in view. */
function flush(g: Game, post: (d: JsonValue) => void, frame?: OmniFrame): boolean {
  const msg: { [k: string]: JsonValue } = { type: 'frame' }
  if (g.outbox.save === true) msg.save = toSave(g) as unknown as JsonValue
  else if (frame !== undefined) msg.frame = frame as unknown as JsonValue
  if (g.outbox.load === true) msg.load = true
  g.outbox = {}
  if (Object.keys(msg).length === 1) return false
  post(msg)
  return msg.frame !== undefined
}

function applyCmd(g: Game, act: string) {
  const [name = '', arg = ''] = act.split(':')
  const sel = g.byId.get(g.selected)
  switch (name) {
    case 'cat': return selectCat(g, arg as Cat)
    case 'tool': g.tool = arg; g.view = 'map'; return
    case 'pause': g.paused = !g.paused; return
    case 'speed': g.speed = Number(arg) || 1; g.paused = false; return
    case 'brush': g.brush = Math.max(1, Math.min(6, g.brush + (Number(arg) || 0))); return
    case 'zoom': {
      const before = desktopVw(g)
      g.zoom = g.zoom === 2 ? 1 : 2
      g.dvh = Math.max(8, Math.min(H, Math.round((g.dvh * desktopVw(g)) / before)))
      return
    }
    case 'borders': g.borders = !g.borders; return
    case 'realms': g.view = g.view === 'realms' ? 'map' : 'realms'; return
    case 'save': g.outbox.save = true; return
    case 'load': g.outbox.load = true; return
    case 'new': return renew(g)
    case 'pan': {
      const [dx = 0, dy = 0] = arg.split(',').map(Number)
      g.camX += dx; g.camY += dy; g.follow = false
      return
    }
    case 'untrait': if (sel) removeTrait(sel, arg as Trait); return
    case 'trait': {
      if (!sel) return
      const free = TRAITS.filter(t => !sel.traits.includes(t))
      if (free.length > 0) addTrait(sel, pick(free))
      return
    }
    case 'follow': g.follow = !g.follow; return
    case 'smite': if (sel) TOOLS.find(t => t.id === 'lightning')?.apply(g, sel.x, sel.y, 0); return
    case 'close': g.selected = -1; g.follow = false; return
  }
}

function infoOf(g: Game): OmniInfo {
  const u = g.byId.get(g.selected)
  if (u === undefined || u.hp <= 0) return { kind: 'log' }
  const info = KINDS[u.k]
  const k = u.kd >= 0 ? g.kingdoms[u.kd] : undefined
  const role = k ? (k.king === u.id ? `ruler of ${k.name}` : `of ${k.name}`) : isRace(u.k) ? 'wanderer' : 'wild'
  const status = [u.sick > 0 ? 'sick' : '', u.mad > 0 ? 'mad' : ''].filter(Boolean).join(', ')
  return {
    kind: 'unit', name: u.name, color: k?.color ?? info.color, follow: g.follow, canTrait: isRace(u.k),
    line: `${info.label}, ${role} · age ${Math.floor(u.age)} · ♥ ${Math.ceil(u.hp)}/${u.max} · ⚔ ${u.dmg + (k?.tech ?? 0)} · ⛨ ${u.arm} · ≫ ${u.spd}${status ? ` · ${status}` : ''}`,
    traits: u.traits.map(t => ({ name: t, good: GOOD_TRAITS.includes(t) })),
  }
}

function realmsOf(g: Game): OmniRealm[] {
  return g.kingdoms.filter(k => k.alive).sort((a, b) => b.pop - a.pop).map(k => {
    const king = g.byId.get(k.king)
    return {
      name: k.name, color: k.color,
      text: `${KINDS[k.race].label} · pop ${k.pop} · ⌂ ${k.houses} · ${AGES[k.tech]}${king ? ` · ruler ${king.name}` : ' · no ruler'}`,
      wars: k.war.map(id => g.kingdoms[id]?.name).filter(Boolean).join(', '),
      allies: g.kingdoms.filter(o => o.alive && o.id !== k.id && (k.rel[o.id] ?? 0) > 55).map(o => o.name).join(', '),
    }
  })
}

function buildFrame(g: Game): OmniFrame {
  const vw = desktopVw(g)
  if (g.dvh <= 0) g.dvh = Math.round(vw * 0.6)
  const vh = Math.min(H, g.dvh)
  const sel = g.byId.get(g.selected)
  if (g.follow && sel !== undefined) { g.camX = sel.x - Math.floor(vw / 2); g.camY = sel.y - Math.floor(vh / 2) }
  g.camX = Math.max(0, Math.min(W - vw, g.camX))
  g.camY = Math.max(0, Math.min(H - vh, g.camY))
  const cx = g.camX, cy = g.camY
  const inView = (x: number, y: number) => x >= cx && y >= cy && x < cx + vw && y < cy + vh
  let terr = '', owner = ''
  const fire: number[] = [], houses: number[] = []
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
    const i = (cy + y) * W + cx + x
    terr += String.fromCharCode(65 + (g.terrain[i] ?? 0))
    if (g.borders) owner += String.fromCharCode(48 + (g.territory[i] ?? 0))
    if ((g.fire[i] ?? 0) > 0) fire.push(y * vw + x)
    const h = g.house[i] ?? 0
    if (h !== 0) {
      const k = g.kingdoms[h - 1]
      houses.push(y * vw + x, h - 1, k && k.cx === cx + x && k.cy === cy + y ? 1 : 0)
    }
  }
  const units: number[] = []
  for (const u of g.units) {
    if (u.hp <= 0 || !inView(u.x, u.y)) continue
    const k = g.kingdoms[u.kd]
    const flags = (k?.king === u.id ? 1 : 0) | (u.sick > 0 ? 2 : 0) | (u.mad > 0 ? 4 : 0) | (u.id === g.selected ? 8 : 0)
    units.push(u.x - cx, u.y - cy, KIND_ORDER.indexOf(u.k), isRace(u.k) ? u.kd : -1, flags, u.id)
  }
  const fx: number[] = []
  for (const f of g.fx) {
    if (f.x + f.r < cx || f.y + f.r < cy || f.x - f.r >= cx + vw || f.y - f.r >= cy + vh) continue
    fx.push(FX_ORDER.indexOf(f.kind), f.x - cx, f.y - cy, f.r, f.ttl)
  }
  const pop = g.units.filter(u => isRace(u.k) && u.hp > 0).length
  const alive = g.kingdoms.filter(k => k.alive)
  const tool = toolOf(g)
  const lines = g.view === 'realms' ? g.log.slice(-14).reverse() : g.log.slice(-3).reverse()
  if (g.flashTtl > 0) lines.unshift(g.flash)
  return {
    vw, vh, camX: cx, camY: cy, tick: g.tick, terr, owner, fire, houses, units, fx,
    hover: g.hover !== null && g.cat !== 'inspect' && inView(g.hover.x, g.hover.y) ? [g.hover.x - cx, g.hover.y - cy, g.brush - 1] : [],
    colors: g.kingdoms.map(k => k.color),
    hud: {
      year: year(g), pop, kingdoms: alive.length, wars: alive.reduce((n, k) => n + k.war.length, 0) / 2,
      beasts: g.units.length - pop, cat: g.cat, tool: tool.id, toolLabel: tool.label, paused: g.paused,
      speed: g.speed, brush: g.brush, zoom: g.zoom, borders: g.borders, view: g.view, ack: g.cmdSeq, rows: g.rows,
    },
    info: infoOf(g),
    realms: g.view === 'realms' ? realmsOf(g) : [],
    log: lines,
  }
}

type ClientProps = { desktop?: boolean; availRows?: number; cmds?: OmniCmd[]; load?: unknown; nonce?: number }

/**
 * On the desktop this region lies over the hooks module's picture of the
 * map, exactly its size: it draws nothing and turns pointer cells into
 * tiles. Its measured size against the picture's tiles says how tall a cell
 * is beside how wide, so the view takes as many rows as the pane has room.
 */
function drawDesktop(g: Game, s: ClientSurface<Box>, p: ClientProps) {
  if (typeof p.availRows === 'number' && p.availRows > 0) g.availRows = p.availRows
  for (const c of p.cmds ?? []) {
    if (c.seq <= g.cmdSeq) continue
    g.cmdSeq = c.seq
    applyCmd(g, c.act)
  }
  // The map's box is the pane's width (this region's columns) by the rows the
  // pane gives it; the picture fills it exactly, so only how many tiles go
  // down is chosen here: enough for square tiles, a text cell being about
  // CELL_ASPECT as wide as it is tall. A wrong guess stretches the tiles a
  // little; it never moves a click off its tile.
  g.cols = s.columns
  g.rows = g.availRows
  if (g.cols > 0) g.dvh = Math.max(6, Math.min(H, Math.round((g.rows * desktopVw(g)) / (g.cols * CELL_ASPECT))))
  const frame = buildFrame(g)
  const key = JSON.stringify(frame)
  if (key !== g.lastFrame || g.outbox.save === true || g.outbox.load === true) {
    g.lastFrame = flush(g, d => s.post(d), frame) ? key : ''
  }
  const { Box } = s.elements
  return <Box width="100%" height={Math.max(1, g.rows)} />
}

type Box = { g: Game; n: number }

function draw(g: Game, s: ClientSurface<Box>) {
  const { Box, Text } = s.elements
  const cols = Math.max(20, s.columns || 80)
  const total = Math.max(14, s.rows || 30)
  g.regions = []

  const pop = g.units.filter(u => isRace(u.k)).length
  const alive = g.kingdoms.filter(k => k.alive)
  const wars = alive.reduce((n, k) => n + k.war.length, 0) / 2
  const tool = toolOf(g)
  const header: Seg[] = [
    { text: ' OmniRealm ', fg: '#111111', bg: '#ffd43b', bold: true },
    { text: ` Year ${year(g)} · pop ${pop} · ${alive.length} kingdoms${wars > 0 ? ` · ${wars} at war` : ''} · ${g.units.length - pop} beasts · `, fg: '#dee2e6' },
    { text: `${tool.label}${tool.cat !== 'inspect' && tool.id !== 'lightning' ? ` ×${g.brush}` : ''}`, fg: '#74c0fc', bold: true },
    { text: g.paused ? '  ❚❚ paused' : `  ▶ ${g.speed}x`, fg: g.paused ? '#ffa94d' : '#8ce99a' },
  ]

  // Bottom: categories and controls, the tools of the category, then info.
  const btn = (label: string, active: boolean, act: () => void, color = '#dee2e6'): Item =>
    ({ text: ` ${label} `, fg: active ? '#111111' : color, bg: active ? '#ffd43b' : '#343a40', bold: active, act })
  const gap: Item = { text: ' ' }
  const controls: Item[] = []
  for (const [c, label] of CATS) controls.push(btn(label, g.cat === c && g.view === 'map', () => selectCat(g, c)), gap)
  controls.push({ text: '│ ', fg: '#495057' },
    btn(g.paused ? '▶' : '❚❚', g.paused, () => { g.paused = !g.paused }), gap,
    btn('1x', !g.paused && g.speed === 1, () => { g.speed = 1; g.paused = false }), gap,
    btn('2x', !g.paused && g.speed === 2, () => { g.speed = 2; g.paused = false }), gap,
    btn('4x', !g.paused && g.speed === 4, () => { g.speed = 4; g.paused = false }), gap,
    { text: '│ ', fg: '#495057' },
    btn('−', false, () => { g.brush = Math.max(1, g.brush - 1) }), { text: ` brush ${g.brush} `, fg: '#adb5bd' }, btn('+', false, () => { g.brush = Math.min(6, g.brush + 1) }), gap,
    btn(g.zoom === 2 ? 'Zoom out' : 'Zoom in', false, () => { g.zoom = g.zoom === 2 ? 1 : 2 }), gap,
    btn('Borders', g.borders, () => { g.borders = !g.borders }), gap,
    btn('Realms', g.view === 'realms', () => { g.view = g.view === 'realms' ? 'map' : 'realms' }), gap,
    btn('Save', false, () => { g.outbox.save = true; flush(g, d => s.post(d)) }, '#8ce99a'), gap,
    btn('Load', false, () => { g.outbox.load = true; flush(g, d => s.post(d)) }, '#74c0fc'), gap,
    btn('New world', false, () => renew(g), '#ffa8a8'),
  )
  const toolItems: Item[] = []
  for (const t of TOOLS.filter(x => x.cat === g.cat)) toolItems.push(btn(t.label, t.id === g.tool, () => { g.tool = t.id; g.view = 'map' }, '#ced4da'), gap)

  // Measure the bottom block first so the map takes what is left.
  const nControls = flow(g, controls, cols, 0).length
  const nTools = flow(g, toolItems, cols, 0).length
  const info = infoItems(g)
  const nInfo = info.length === 0 ? 1 : 2
  g.mapTop = 1
  const room = Math.max(4, total - 1 - nControls - nTools - nInfo)

  const line = (segs: Seg[], key: string) => (
    <Text key={key} wrap="truncate">
      {segs.map((sg, n) => (
        <Text key={String(n)} color={sg.fg} backgroundColor={sg.bg} bold={sg.bold === true ? true : undefined}>{sg.text}</Text>
      ))}
    </Text>
  )

  const build = (detail: number) => {
    g.mapRows = detail === 0 ? Math.max(4, Math.floor(room / 2)) : room
    const bottomTop = g.mapTop + g.mapRows
    g.regions = []
    const body = g.view === 'realms' ? realmRows(g, cols, g.mapRows) : mapRowsOf(g, cols, g.mapRows, detail)
    while (body.length < g.mapRows) body.push([{ text: ' ' }])
    const ctlRows = flow(g, controls, cols, bottomTop)
    const toolRows = flow(g, toolItems, cols, bottomTop + nControls)
    const infoRows: Seg[][] = []
    info.forEach((one, n) => infoRows.push(...flow(g, one, cols * 4, bottomTop + nControls + nTools + n).slice(0, 1)))
    while (infoRows.length < nInfo) infoRows.push([{ text: ' ' }])
    return (
      <Box flexDirection="column" width={cols}>
        {line(header, 'h')}
        {body.slice(0, g.mapRows).map((r, n) => line(r, `m${n}`))}
        {ctlRows.map((r, n) => line(r, `c${n}`))}
        {toolRows.map((r, n) => line(r, `t${n}`))}
        {infoRows.map((r, n) => line(r, `i${n}`))}
      </Box>
    )
  }

  // Step detail down until the tree fits; now and then try one level up.
  g.frames++
  let detail = g.view === 'realms' ? 3 : g.frames % 40 === 0 ? Math.min(3, g.detail + 1) : g.detail
  let tree = build(detail)
  while (detail > 0 && JSON.stringify(tree).length > TREE_BUDGET) tree = build(--detail)
  if (g.view === 'map') g.detail = detail
  return tree
}


const World: ClientModule<JsonValue, Box> = (props, s) => {
  const p = (props !== null && typeof props === 'object' && !Array.isArray(props) ? props : {}) as ClientProps
  let box = s.state
  if (box === undefined) {
    const g = newGame()
    g.desktop = p.desktop === true
    g.cmdSeq = Math.max(0, ...(p.cmds ?? []).map(c => c.seq))
    box = { g, n: 0 }
    const redraw = () => s.setState({ g, n: (s.state?.n ?? 0) + 1 })
    s.every(TICK_MS, () => {
      if (g.flashTtl > 0) g.flashTtl--
      if (g.paused) return
      for (let n = 0; n < g.speed; n++) step(g)
      redraw()
    })
    s.onPointer(e => { if (onPointer(g, e)) redraw() })
    s.onKey(e => { if (onKey(g, e, d => s.post(d))) redraw() })
    s.setState(box)
  }
  const g = box.g
  if (typeof p.nonce === 'number' && p.nonce !== g.loadedNonce && p.load !== undefined) {
    g.loadedNonce = p.nonce
    fromSave(g, p.load as Save)
  }
  return g.desktop ? drawDesktop(g, s, p) : draw(g, s)
}

export default World
