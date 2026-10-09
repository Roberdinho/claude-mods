import type { OmniFrame } from '../types'

/*
 * The desktop's picture of the world: pixel-art SVG built from a frame.
 * Terrain is one path per kind filled with a textured pattern, so the size
 * follows the shape of the land, not its area; sprites are symbols drawn
 * from 8x8 pixel maps, tinted by kingdom through `currentColor`.
 */

const T = 16

// Kept in step with the game's own tables in world.tsx.
const KIND_IDS = ['human', 'elf', 'orc', 'dwarf', 'sheep', 'chicken', 'wolf', 'bear', 'dragon', 'demon', 'ufo', 'zombie']
const FX_IDS = ['rain', 'flash', 'boom', 'tornado', 'volcano', 'heal', 'plague', 'magic', 'nuke']
const DEEP = 0, SHALLOW = 1, SAND = 2, GRASS = 3, FOREST = 4, HILLS = 5, MOUNTAIN = 6, SNOW = 7,
  DESERT = 8, SWAMP = 9, ENCHANTED = 10, LAVA = 12

const PALETTE: Record<string, string> = {
  k: '#1b1b1f', w: '#ffffff', h: '#ead9b0', s: '#f2c08d', b: '#7a4a21', B: '#4e2e12', g: '#3f8f3a',
  G: '#24602a', l: '#6fc35a', r: '#d63a2a', R: '#8f1f16', o: '#f08a24', y: '#ffd23f', e: '#a3a3a3',
  E: '#5d5d63', p: '#8b4fd6', P: '#ff5fa8', u: '#3b6fc8', t: '#6ff0d0', n: '#f4f8fb', z: '#8fbf4f',
  m: '#c9ccd1', M: '#8a8f99', c: 'currentColor',
}

/** Horizontal runs of one colour become one rect each. */
function pixels(rows: string[], scale: number, palette: Record<string, string> = PALETTE): string {
  let out = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const ch = row[x] as string
      let end = x + 1
      while (end < row.length && row[end] === ch) end++
      const fill = palette[ch]
      if (fill !== undefined) out += `<rect x="${x * scale}" y="${y * scale}" width="${(end - x) * scale}" height="${scale}" fill="${fill}"/>`
      x = end
    }
  })
  return out
}

const SPRITES: Record<string, string[]> = {
  tree: ['...GG...', '..GgGG..', '.GggglG.', '.GgglgG.', '..GggG..', '...bB...', '...bB...', '........'],
  pine: ['...G....', '..GgG...', '...G....', '..GgG...', '.GgggG..', '..GGG...', '...b....', '........'],
  mountain: ['........', '...nn...', '..nnEE..', '..eeEE..', '.eeeEEE.', '.eeeeEEE', 'eeeeeEEE', '........'],
  hill: ['........', '........', '........', '...ll...', '..lggg..', '.lggggG.', 'lgggggGG', '........'],
  cactus: ['........', '...g....', '.g.g....', '.ggg.g..', '...ggg..', '...g....', '...g....', '........'],
  reed: ['........', '.b...b..', '.g.b.g..', '.g.g.g..', '.ggg.g..', '..g.gg..', '........', '........'],
  crystal: ['........', '...t....', '..tpt...', '..ppp.t.', '..pPp.p.', '...p....', '........', '........'],
  house: ['...cc...', '..cccc..', '.cccccc.', 'cccccccc', '.hhhhhh.', '.hhBBhh.', '.hhBBhh.', '........'],
  castle: ['c.c..c.c', 'cccccccc', '.mmmmmm.', '.mMmmMm.', '.mmBBmm.', '.mmBBmm.', '.MmBBmM.', '........'],
  fire: ['...y....', '..yo.y..', '..oyo...', '.oryo.o.', '.orryoo.', '.rroorr.', '..rrRr..', '........'],
  human: ['...bb...', '..bssb..', '...ss...', '..cccc..', '.sccccs.', '..cccc..', '..u..u..', '..k..k..'],
  elf: ['..yyyy..', '.s.ss.s.', '...ss...', '..cccc..', '.sccccs.', '..cccc..', '..g..g..', '..k..k..'],
  orc: ['........', '..zzzz..', '..zwwz..', '.cccccc.', 'zccccccz', '.cccccc.', '..E..E..', '..k..k..'],
  dwarf: ['........', '..mmmm..', '..ssss..', '..oooo..', '.cooooc.', '.cccccc.', '..b..b..', '..k..k..'],
  sheep: ['........', '........', '.wwwww..', 'wwwwwwkk', 'wwwwwwkk', '.wwwww..', '.k.k.k..', '........'],
  chicken: ['........', '....r...', '...ww...', '..wwwo..', 'wwwww...', '.www....', '..y.....', '........'],
  wolf: ['........', '......e.', '.....eee', 'eeeeeeek', 'eeeeeee.', '.e.e.e..', '.e.e.e..', '........'],
  bear: ['.B...B..', '.bbbbb..', '.bkbkbbb', '.bbbbbbb', 'bbbbbbbb', 'bbbbbbbb', '.b.b.b.b', '........'],
  dragon: ['r.....r.', 'rr...rr.', '.rrrrr..', '..rrrrry', '.rrRrrr.', 'rr.rr.rr', 'r..r...r', '........'],
  demon: ['r......r', '.r....r.', '..PPPP..', '..PyyP..', '.PPPPPP.', 'P.PPPP.P', '..P..P..', '..k..k..'],
  ufo: ['........', '...tt...', '..tttt..', '.mmmmmm.', 'mmymymmm', '.mmmmmm.', '..y..y..', '........'],
  zombie: ['...zz...', '..zkzk..', '...zz...', '.zuuuu..', 'z.uuuuz.', '..uuuu..', '..E..E..', '..k..k..'],
  crown: ['........', 'y..y..y.', 'yyyyyyy.', '........', '........', '........', '........', '........'],
}

type Pattern = { base: string; rows?: string[]; pal?: Record<string, string> }

const PATTERNS: Pattern[] = [
  { base: '#1f4f8f', rows: ['........', '.ww.....', 'w..w....', '........', '........', '.....ww.', '....w..w', '........'], pal: { w: '#2f66aa' } },
  { base: '#3d86c6', rows: ['........', '..ww....', '.w..w...', '........', '........', '......ww', '.....w..', '........'], pal: { w: '#62a8e0' } },
  { base: '#e2cf8a', rows: ['........', '.d......', '.....d..', '........', '...d....', '........', '......d.', '..d.....'], pal: { d: '#c9b06a' } },
  { base: '#5fa548', rows: ['........', '.l......', '.dl..d..', '.....dl.', '........', '..d.....', '..dl..l.', '......d.'], pal: { d: '#4c8f3a', l: '#7dc362' } },
  { base: '#3e7d35', rows: ['........', '..d.....', '......d.', '........', '.d......', '....d...', '........', '.......d'], pal: { d: '#356d2d' } },
  { base: '#8f9a55', rows: ['........', '..dd....', '........', '.....dd.', '........', '.dd.....', '........', '....dd..'], pal: { d: '#7a8446' } },
  { base: '#7b746c', rows: ['........', '.d......', '.....d..', '........', '..d.....', '......d.', '........', '...d....'], pal: { d: '#6a645c' } },
  { base: '#eef3f6', rows: ['........', '..d.....', '......d.', '........', '....d...', '.d......', '........', '......d.'], pal: { d: '#d5e0e8' } },
  { base: '#e8b866', rows: ['........', '........', '..dddd..', '.d....d.', '........', '........', 'dd....dd', '..dddd..'], pal: { d: '#d6a352' } },
  { base: '#4f6440', rows: ['........', '.ww.....', 'wwww....', '.ww.....', '.....d..', '....ww..', '...wwww.', '....ww..'], pal: { w: '#3e5a5c', d: '#62784f' } },
  { base: '#5d4594', rows: ['........', '.s......', '........', '.....s..', '........', '..s.....', '......s.', '........'], pal: { s: '#d6b8ff' } },
  { base: '#3f1d36', rows: ['..v.....', '..v.....', '...v....', '...vv...', '.....v..', '.....v..', '....v...', '........'], pal: { v: '#8a2f63' } },
  { base: '#cf3f16', rows: ['........', '.yy.....', '.yoy....', '..y...d.', '.....ddd', '......d.', '..o.....', '........'], pal: { y: '#ffc23a', o: '#ff8a1c', d: '#9e2a0b' } },
  { base: '#b9e2f2', rows: ['w.......', '.w......', '..w.....', '..w.....', '...ww...', '.....w..', '......w.', '.......w'], pal: { w: '#e8f7fd' } },
  { base: '#3d3532', rows: ['........', '.a......', '.....a..', '...a....', '........', '......a.', '..a.....', '........'], pal: { a: '#5b4f49' } },
]

// Water and lava shimmer: a second pattern offset by a pixel, swapped each frame.
const ALT: Record<number, number> = { [DEEP]: 15, [SHALLOW]: 16, [LAVA]: 17 }

function patternDefs(): string {
  const one = (id: string, p: Pattern, shift: number) => {
    const rows = (p.rows ?? []).map(r => r.slice(shift) + r.slice(0, shift))
    return `<pattern id="${id}" width="${T}" height="${T}" patternUnits="userSpaceOnUse"><rect width="${T}" height="${T}" fill="${p.base}"/>${pixels(rows, 2, p.pal)}</pattern>`
  }
  // Land whose every tile carries a sprite has it baked into its texture,
  // so a view full of forest costs one path, not a sprite per tile.
  const withSprites = (id: string, p: Pattern, sprites: string[]) =>
    `<pattern id="${id}" width="${T * sprites.length}" height="${T}" patternUnits="userSpaceOnUse"><rect width="${T * sprites.length}" height="${T}" fill="${p.base}"/>`
    + sprites.map((sp, n) => `<g transform="translate(${n * T} 0)">${pixels(p.rows ?? [], 2, p.pal)}${pixels(SPRITES[sp] ?? [], 2)}</g>`).join('') + '</pattern>'
  const baked: Record<number, string[]> = { [FOREST]: ['tree', 'pine', 'tree'], [MOUNTAIN]: ['mountain'], [HILLS]: ['hill', 'hill', '.'] }
  let out = PATTERNS.map((p, i) => baked[i] !== undefined ? withSprites(`t${i}`, p, baked[i] ?? []) : one(`t${i}`, p, 0)).join('')
  for (const [t, alt] of Object.entries(ALT)) out += one(`t${alt}`, PATTERNS[Number(t)] as Pattern, 2)
  return out
}

const DEFS = `<defs>${patternDefs()}${Object.entries(SPRITES).map(([id, rows]) => `<symbol id="${id}" viewBox="0 0 8 8">${pixels(rows, 1)}</symbol>`).join('')}`
  + `<radialGradient id="boom"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffb12a"/><stop offset="1" stop-color="#d9480f" stop-opacity="0"/></radialGradient>`
  + `<radialGradient id="glow"><stop offset="0" stop-color="#ff6a2a" stop-opacity=".7"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient></defs>`

/** A cheap per-tile hash, for decorations that stay put. */
const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0

const use = (id: string, x: number, y: number, size = T, extra = '') =>
  `<use href="#${id}" x="${x}" y="${y}" width="${size}" height="${size}"${extra}/>`

/** What an Svg's source may hold, less a margin. */
const SVG_BUDGET = 124_000

/**
 * The picture of a frame, as much of it as fits an Svg's source: past the
 * budget it drops the sparse decorations and the shore foam, then the
 * borders' wash, rather than leave the pane blank.
 */
export function worldSvg(f: OmniFrame): string {
  let svg = ''
  for (const detail of [2, 1, 0]) {
    svg = drawWorld(f, detail)
    if (svg.length <= SVG_BUDGET) return svg
  }
  return svg
}

function drawWorld(f: OmniFrame, detail: number): string {
  const { vw, vh, camX: worldX, camY: worldY } = f
  const W = vw * T, H = vh * T
  const out: string[] = []
  // The pane stretches the picture over a box of its own: as wide as the
  // pane, as tall as the rows it gives the map. It fills that box exactly,
  // so the game's input region laid over the same box lines up tile for tile.
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="4000" height="${Math.round((4000 * vh) / vw)}" preserveAspectRatio="none" shape-rendering="crispEdges">`)
  out.push(DEFS)

  // Terrain: one path per kind, a run of equal tiles per subpath.
  const paths = new Map<number, string>()
  for (let y = 0; y < vh; y++) {
    let x = 0
    while (x < vw) {
      const t = f.terr.charCodeAt(y * vw + x) - 65
      let end = x + 1
      while (end < vw && f.terr.charCodeAt(y * vw + end) - 65 === t) end++
      paths.set(t, (paths.get(t) ?? '') + `M${x * T} ${y * T}h${(end - x) * T}v${T}h-${(end - x) * T}z`)
      x = end
    }
  }
  const odd = f.tick % 2 === 1
  for (const [t, d] of paths) out.push(`<path fill="url(#t${odd && ALT[t] !== undefined ? ALT[t] : t})" d="${d}"/>`)

  // Shore foam where land meets water, on the land's edge.
  let foam = ''
  for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
    const t = f.terr.charCodeAt(y * vw + x) - 65
    if (t === DEEP || t === SHALLOW) continue
    const water = (dx: number, dy: number) => {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= vw || ny >= vh) return false
      const n = f.terr.charCodeAt(ny * vw + nx) - 65
      return n === DEEP || n === SHALLOW
    }
    if (water(0, -1)) foam += `M${x * T} ${y * T}h${T}`
    if (water(0, 1)) foam += `M${x * T} ${y * T + T}h${T}`
    if (water(-1, 0)) foam += `M${x * T} ${y * T}v${T}`
    if (water(1, 0)) foam += `M${x * T + T} ${y * T}v${T}`
  }
  if (foam && detail >= 2) out.push(`<path d="${foam}" stroke="#e9f6ff" stroke-opacity=".55" stroke-width="2" fill="none"/>`)

  // Kingdom borders: a wash of each realm's colour over its land.
  if (f.owner.length === vw * vh && detail >= 1) {
    const wash = new Map<number, string>()
    for (let y = 0; y < vh; y++) {
      let x = 0
      while (x < vw) {
        const o = f.owner.charCodeAt(y * vw + x) - 48
        let end = x + 1
        while (end < vw && f.owner.charCodeAt(y * vw + end) - 48 === o) end++
        if (o > 0) wash.set(o, (wash.get(o) ?? '') + `M${x * T} ${y * T}h${(end - x) * T}v${T}h-${(end - x) * T}z`)
        x = end
      }
    }
    for (const [o, d] of wash) out.push(`<path fill="${f.colors[o - 1] ?? '#fff'}" fill-opacity=".28" d="${d}"/>`)
  }

  // Decorations that belong to the land.
  const houses = new Set<number>()
  for (let n = 0; n < f.houses.length; n += 3) houses.add(f.houses[n] ?? -1)
  for (let y = 0; y < vh && detail >= 2; y++) for (let x = 0; x < vw; x++) {
    const i = y * vw + x
    if (houses.has(i)) continue
    const t = f.terr.charCodeAt(i) - 65
    const hsh = hash(x + worldX, y + worldY)
    const px = x * T, py = y * T
    if (t === DESERT && hsh % 9 === 0) out.push(use('cactus', px, py))
    else if (t === SWAMP && hsh % 4 === 0) out.push(use('reed', px, py))
    else if (t === ENCHANTED && hsh % 5 === 0) out.push(use('crystal', px, py))
    else if (t === SNOW && hsh % 11 === 0) out.push(use('pine', px, py))
    else if (t === GRASS && hsh % 23 === 0) out.push(use('tree', px, py, 12, ' opacity=".9"'))
  }

  // Houses and capitals in their kingdom's colour.
  for (let n = 0; n < f.houses.length; n += 3) {
    const i = f.houses[n] ?? 0, kd = f.houses[n + 1] ?? 0, cap = f.houses[n + 2] === 1
    out.push(use(cap ? 'castle' : 'house', (i % vw) * T, Math.floor(i / vw) * T, T, ` color="${f.colors[kd] ?? '#ccc'}"`))
  }

  // Fire, flickering between two sizes.
  for (const i of f.fire) {
    const x = (i % vw) * T, y = Math.floor(i / vw) * T
    const big = (i + f.tick) % 2 === 0
    out.push(`<rect x="${x}" y="${y}" width="${T}" height="${T}" fill="url(#glow)"/>`)
    out.push(use('fire', x + (big ? 0 : 2), y + (big ? 0 : 3), big ? T : 12))
  }

  // Creatures: a step of bob, the crowd spread a little, rulers crowned.
  for (let n = 0; n < f.units.length; n += 6) {
    const x = f.units[n] ?? 0, y = f.units[n + 1] ?? 0, kind = KIND_IDS[f.units[n + 2] ?? 0] ?? 'human'
    const kd = f.units[n + 3] ?? -1, flags = f.units[n + 4] ?? 0, id = f.units[n + 5] ?? 0
    const big = kind === 'dragon' || kind === 'ufo' || kind === 'demon'
    const size = big ? 24 : 13
    const ox = x * T + (T - size) / 2 + (big ? 0 : ((id % 3) - 1) * 2)
    const oy = y * T + (T - size) / 2 - ((f.tick + id) % 2) - (big ? 4 : 0)
    const color = kd >= 0 ? f.colors[kd] ?? '#ddd' : '#c8b9a6'
    if (flags & 8) out.push(`<rect x="${x * T - 1}" y="${y * T - 1}" width="${T + 2}" height="${T + 2}" fill="none" stroke="#fff" stroke-width="2"/>`)
    if (big) out.push(`<ellipse cx="${x * T + 8}" cy="${y * T + 15}" rx="9" ry="3" fill="#000" fill-opacity=".3"/>`)
    const tint = flags & 2 ? ' opacity=".75"' : ''
    out.push(use(kind, ox, oy, size, ` color="${flags & 4 ? '#ff4dff' : color}"${tint}`))
    if (flags & 2) out.push(`<circle cx="${x * T + 12}" cy="${y * T + 3}" r="2.5" fill="#a9e34b"/>`)
    if (flags & 1) out.push(use('crown', ox + 2, oy - 6, 9))
  }

  // Powers in flight.
  for (let n = 0; n < f.fx.length; n += 5) {
    const kind = FX_IDS[f.fx[n] ?? 0], x = f.fx[n + 1] ?? 0, y = f.fx[n + 2] ?? 0, r = f.fx[n + 3] ?? 0, ttl = f.fx[n + 4] ?? 0
    const cx = x * T + 8, cy = y * T + 8, R = (r + 0.5) * T
    switch (kind) {
      case 'rain': {
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#5c7a99" fill-opacity=".22"/>`)
        let d = ''
        for (let k = 0; k < r * 6 + 6; k++) {
          const a = hash(k, f.tick) % 1000 / 1000 * Math.PI * 2, dd = (hash(f.tick, k) % 1000) / 1000 * R
          const sx = cx + Math.cos(a) * dd, sy = cy + Math.sin(a) * dd
          d += `M${sx.toFixed(0)} ${sy.toFixed(0)}l-3 8`
        }
        out.push(`<path d="${d}" stroke="#cfe8ff" stroke-width="1.5" stroke-opacity=".85"/>`)
        break
      }
      case 'flash':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${T * 1.5}" fill="#fffbe0" fill-opacity=".55"/>`)
        out.push(`<path d="M${cx + 2} ${cy - 120}l-10 40h10l-12 44h9l-8 36 26-48h-10l12-40h-10l10-32z" fill="#fff59a" stroke="#fff" stroke-width="1" shape-rendering="auto"/>`)
        break
      case 'boom':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R * (1.4 - ttl * 0.15)}" fill="url(#boom)" shape-rendering="auto"/>`)
        break
      case 'nuke': {
        const grow = 1.25 - ttl / 12
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R * grow}" fill="url(#boom)" shape-rendering="auto"/>`)
        if (ttl > 6) out.push(`<rect width="${W}" height="${H}" fill="#fff" fill-opacity="${((ttl - 6) / 5).toFixed(2)}"/>`)
        else out.push(`<g shape-rendering="auto" fill="#9c8f86" fill-opacity=".85"><rect x="${cx - 8}" y="${cy - 70}" width="16" height="70"/><ellipse cx="${cx}" cy="${cy - 78}" rx="46" ry="26"/><ellipse cx="${cx}" cy="${cy - 92}" rx="30" ry="16" fill="#b8aaa0"/></g>`)
        break
      }
      case 'tornado': {
        const s = f.tick % 2 === 0 ? 1 : -1
        out.push(`<g shape-rendering="auto" fill="none" stroke="#d9dde2" stroke-width="3" stroke-opacity=".9">`
          + `<ellipse cx="${cx}" cy="${cy - 26}" rx="22" ry="6"/><ellipse cx="${cx + 3 * s}" cy="${cy - 16}" rx="16" ry="5"/>`
          + `<ellipse cx="${cx - 2 * s}" cy="${cy - 7}" rx="10" ry="4"/><ellipse cx="${cx + s}" cy="${cy + 1}" rx="5" ry="3"/></g>`)
        break
      }
      case 'volcano':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${T * 3}" fill="url(#glow)" shape-rendering="auto"/>`)
        out.push(`<g fill="#ffb12a">${[0, 1, 2, 3, 4].map(k => { const a = hash(k, f.tick) % 628 / 100; const d = 8 + (hash(f.tick, k) % 30); return `<rect x="${(cx + Math.cos(a) * d).toFixed(0)}" y="${(cy - 10 - Math.abs(Math.sin(a)) * d).toFixed(0)}" width="3" height="3"/>` }).join('')}</g>`)
        break
      case 'heal':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#8ce99a" fill-opacity=".18"/>`)
        out.push(`<g fill="#b2f2bb">${[0, 1, 2, 3, 4, 5].map(k => { const a = k + f.tick * 0.3; const d = R * 0.6; const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d - ttl; return `<rect x="${(px - 1).toFixed(0)}" y="${(py - 4).toFixed(0)}" width="3" height="9"/><rect x="${(px - 4).toFixed(0)}" y="${(py - 1).toFixed(0)}" width="9" height="3"/>` }).join('')}</g>`)
        break
      case 'plague':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#94d82d" fill-opacity=".28" shape-rendering="auto"/>`)
        break
      case 'magic':
        out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="#be4bdb" fill-opacity=".2" shape-rendering="auto"/>`)
        out.push(`<g fill="#f3d9fa">${[0, 1, 2, 3, 4, 5, 6].map(k => { const a = hash(k, ttl) % 628 / 100; const d = (hash(ttl, k) % 100) / 100 * R; return `<rect x="${(cx + Math.cos(a) * d).toFixed(0)}" y="${(cy + Math.sin(a) * d).toFixed(0)}" width="3" height="3"/>` }).join('')}</g>`)
        break
    }
  }

  // The brush under the pointer.
  if (f.hover.length === 3) {
    const [x = 0, y = 0, r = 0] = f.hover
    out.push(`<circle cx="${x * T + 8}" cy="${y * T + 8}" r="${(r + 0.5) * T}" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".8" stroke-width="1.5" stroke-dasharray="4 3" shape-rendering="auto"/>`)
  }

  out.push('</svg>')
  return out.join('')
}
