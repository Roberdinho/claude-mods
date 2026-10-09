import { expect, mock, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

import type { OmniFrame } from '../types'

/*
 * A playtest of the desktop panel: every dropdown option, every button and
 * every tool, each checked for the change it should make to the world.
 */

const PANE: RenderPropsOf['Pane'] = {
  title: 'OmniRealm', isFocused: true, bodyColumns: 100, placement: 'dock',
  scroll: { offset: 0, bodyRows: 44 }, view: {},
}
const COLS = 100

async function setup($: any, on: any) {
  mock.store(on)
  // The test engine keeps no $.state of its own to read: catch each frame
  // the plugin writes as it passes on its way to be stored.
  let last: OmniFrame | undefined
  on('state.set', async (_$: unknown, e: { plugin?: string; key?: string; value?: unknown }, next: (e: unknown) => unknown) => {
    if (e.plugin === 'omnirealm' && e.key === 'frame') last = e.value as OmniFrame
    return next(e)
  })
  const ui = await $.ui.mount({ plugin: 'omnirealm', surface: 'desktop', component: 'Pane', requestId: 'omnirealm', props: PANE })
  const frame = async (): Promise<OmniFrame> => last as OmniFrame
  // The map's box: the region's columns across, the rows the pane gives it down.
  const sync = async () => { await ui.advance(240) }
  const rows = () => last?.hud.rows ?? 0
  await ui.resize({ columns: COLS, rows: 30, in: 'world' })
  await ui.advance(120 * 48 * 4)
  await sync()
  // The cell of the region over a tile of the view.
  const cellOf = async (tx: number, ty: number) => {
    const f = await frame()
    return { x: Math.floor(((tx + 0.5) * COLS) / f.vw), y: Math.floor(((ty + 0.5) * f.hud.rows) / f.vh) }
  }
  const click = async (tx: number, ty: number) => {
    const c = await cellOf(tx, ty)
    await ui.pointer({ type: 'down', ...c, button: 'left', in: 'world' })
    await ui.pointer({ type: 'up', ...c, button: 'left', in: 'world' })
    await ui.advance(120)
  }
  const landTile = async (skip = 0, margin = 0) => {
    const f = await frame()
    let seen = 0
    for (let i = 0; i < f.terr.length; i++) {
      const t = f.terr.charCodeAt(i) - 65
      const x = i % f.vw, y = Math.floor(i / f.vw)
      if (x < margin || y < margin || x >= f.vw - margin || y >= f.vh - margin) continue
      if ((t === 3 || t === 2 || t === 8) && seen++ >= skip) return { x: i % f.vw, y: Math.floor(i / f.vw) }
    }
    return { x: Math.floor(f.vw / 2), y: Math.floor(f.vh / 2) }
  }
  const terrainAt = async (x: number, y: number) => { const f = await frame(); return f.terr.charCodeAt(y * f.vw + x) - 65 }
  return { ui, frame, click, landTile, terrainAt, sync, rows }
}

const TOOLS: Record<string, string[]> = {
  terrain: ['deep', 'shallow', 'sand', 'grass', 'forest', 'hills', 'mountain', 'desert', 'tundra', 'swamp', 'enchanted', 'corrupt', 'heat', 'cool'],
  nature: ['rain', 'lightning', 'fire', 'tornado', 'quake', 'volcano'],
  life: ['human', 'elf', 'orc', 'dwarf', 'sheep', 'chicken', 'wolf', 'bear', 'dragon', 'demon', 'ufo'],
  destroy: ['dynamite', 'bomb', 'napalm', 'atomic', 'antimatter'],
  magic: ['plague', 'zombie', 'madness', 'heal', 'bless', 'curse'],
  inspect: ['inspect', 'erase'],
}
const PAINT: Record<string, number> = { deep: 0, shallow: 1, sand: 2, grass: 3, forest: 4, hills: 5, mountain: 6, desert: 8, tundra: 7, swamp: 9, enchanted: 10, corrupt: 11 }

test('every category and tool can be picked from the dropdowns', async ($, on) => {
  const { ui, frame } = await setup($, on)
  for (const [cat, tools] of Object.entries(TOOLS)) {
    await ui.select({ key: 'cat', value: cat })
    expect((await frame()).hud.cat).toBe(cat)
    for (const tool of tools) {
      await ui.select({ key: 'tool', value: tool })
      expect((await frame()).hud.tool).toBe(tool)
      // Each tool says what it does under the toolbar.
      const hint = await ui.find({ key: 'hint' })
      expect([tool, (hint?.text ?? '').length > 40 && /the map/.test(hint?.text ?? '')]).toEqual([tool, true])
    }
  }
  await ui.unmount()
})

test('terrain brushes paint the land they name', async ($, on) => {
  const { ui, click, landTile, terrainAt } = await setup($, on)
  await ui.press({ key: 'pause' })
  await ui.select({ key: 'cat', value: 'terrain' })
  const at = await landTile()
  for (const [tool, code] of Object.entries(PAINT)) {
    await ui.select({ key: 'tool', value: tool })
    await click(at.x, at.y)
    expect([tool, await terrainAt(at.x, at.y)]).toEqual([tool, code])
  }
  await ui.unmount()
})

test('life tools put creatures on the map', async ($, on) => {
  const { ui, frame, click, landTile } = await setup($, on)
  // A young world, far from the cap on creatures.
  await ui.press({ key: 'new' })
  await ui.press({ key: 'pause' })
  await ui.select({ key: 'cat', value: 'terrain' })
  await ui.select({ key: 'tool', value: 'grass' })
  // Away from the view's edges, so a herd spread over the brush stays in sight.
  const at = await landTile(0, 6)
  for (let n = 0; n < 6; n++) await ui.press({ key: 'brush-up' })
  await click(at.x, at.y)
  await ui.select({ key: 'cat', value: 'life' })
  const kinds = TOOLS.life ?? []
  for (const [k, tool] of kinds.entries()) {
    const before = (await frame()).units.filter((_v, i) => i % 6 === 2 && _v === k).length
    await ui.select({ key: 'tool', value: tool })
    await click(at.x, at.y)
    const after = (await frame()).units.filter((_v, i) => i % 6 === 2 && _v === k).length
    expect([tool, after > before]).toEqual([tool, true])
  }
  await ui.unmount()
})

test('nature, destruction and magic powers each leave their mark', async ($, on) => {
  const { ui, frame, click, landTile } = await setup($, on)
  await ui.press({ key: 'pause' })
  let n = 0
  for (const cat of ['nature', 'destroy', 'magic']) {
    await ui.select({ key: 'cat', value: cat })
    for (const tool of TOOLS[cat] ?? []) {
      // A fresh patch of land each time, so one power's mark is not mistaken for the next's.
      const at = await landTile((n++) * 7)
      await ui.select({ key: 'tool', value: tool })
      const before = JSON.stringify(await frame())
      await click(at.x, at.y)
      const f = await frame()
      // Something visible happened: an effect, fire, a log line or the land.
      expect([tool, JSON.stringify(f) !== before && (f.fx.length > 0 || f.fire.length > 0 || f.log.join() !== JSON.parse(before).log.join() || f.terr !== JSON.parse(before).terr || f.units.join() !== JSON.parse(before).units.join())]).toEqual([tool, true])
    }
  }
  await ui.unmount()
})

test('the icon buttons do what they say', async ($, on) => {
  const { ui, frame } = await setup($, on)
  // Pause and play.
  await ui.press({ key: 'pause' })
  expect((await frame()).hud.paused).toBe(true)
  const year = (await frame()).hud.year
  await ui.advance(120 * 48 * 2)
  expect((await frame()).hud.year).toBe(year)
  await ui.press({ key: 'pause' })
  expect((await frame()).hud.paused).toBe(false)
  // Speed cycles 1, 2, 4, 1.
  const speeds: number[] = []
  for (let n = 0; n < 4; n++) { await ui.press({ key: 'speed' }); speeds.push((await frame()).hud.speed) }
  expect(speeds).toEqual([2, 4, 1, 2])
  // Brush size within 1..6.
  for (let n = 0; n < 8; n++) await ui.press({ key: 'brush-up' })
  expect((await frame()).hud.brush).toBe(6)
  for (let n = 0; n < 8; n++) await ui.press({ key: 'brush-down' })
  expect((await frame()).hud.brush).toBe(1)
  // Zoom shows more tiles across, and back.
  const vw = (await frame()).vw
  await ui.press({ key: 'zoom' })
  expect((await frame()).vw).toBeGreaterThan(vw)
  await ui.press({ key: 'zoom' })
  expect((await frame()).vw).toBe(vw)
  // Borders paint the realms' land.
  await ui.press({ key: 'borders' })
  expect((await frame()).owner.length).toBe((await frame()).terr.length)
  await ui.press({ key: 'borders' })
  expect((await frame()).owner).toBe('')
  // Realms opens the list, and closes it.
  await ui.press({ key: 'realms' })
  expect(await ui.find({ text: /Realms of the world/ })).toBeDefined()
  await ui.press({ key: 'realms' })
  expect(await ui.find({ text: /Realms of the world/ })).toBeUndefined()
  // A new world starts again at year 0.
  await ui.advance(120 * 48 * 2)
  await ui.press({ key: 'new' })
  expect((await frame()).hud.year).toBe(0)
  await ui.unmount()
})

test('inspecting a creature opens its card, whose buttons work', async ($, on) => {
  const { ui, frame, click } = await setup($, on)
  await ui.press({ key: 'pause' })
  await ui.select({ key: 'cat', value: 'inspect' })
  await ui.select({ key: 'tool', value: 'inspect' })
  const f = await frame()
  let target: { x: number; y: number } | undefined
  for (let n = 0; n < f.units.length; n += 6) if ((f.units[n + 2] ?? 9) < 4) { target = { x: f.units[n] ?? 0, y: f.units[n + 1] ?? 0 }; break }
  expect(target).toBeDefined()
  await click(target!.x, target!.y)
  const card = (await frame()).info
  expect(card.kind).toBe('unit')
  // Add a trait, then remove it again by its chip.
  const count = card.kind === 'unit' ? card.traits.length : 0
  await ui.press({ key: 'trait-add' })
  const added = (await frame()).info
  expect(added.kind === 'unit' ? added.traits.length : -1).toBe(count + 1)
  const chip = added.kind === 'unit' ? added.traits[added.traits.length - 1]?.name : ''
  await ui.press({ key: `trait-${chip}` })
  const removed = (await frame()).info
  expect(removed.kind === 'unit' ? removed.traits.length : -1).toBe(count)
  // Follow, then smite, then close.
  await ui.press({ key: 'follow' })
  const followed = (await frame()).info
  expect(followed.kind === 'unit' && followed.follow).toBe(true)
  await ui.press({ key: 'smite' })
  expect((await frame()).fx.some((_v, i) => i % 5 === 0)).toBe(true)
  const after = (await frame()).info
  if (after.kind === 'unit') {
    await ui.press({ key: 'close' })
    expect((await frame()).info.kind).toBe('log')
  }
  await ui.unmount()
})

test('save and load bring back the saved world', async ($, on) => {
  const { ui, frame } = await setup($, on)
  await ui.press({ key: 'pause' })
  const saved = (await frame()).hud.year
  await ui.press({ key: 'save' })
  await ui.advance(120)
  await ui.press({ key: 'pause' })
  await ui.advance(120 * 48 * 3)
  expect((await frame()).hud.year).toBeGreaterThan(saved)
  await ui.press({ key: 'load' })
  await ui.advance(120)
  expect((await frame()).hud.year).toBe(saved)
  await ui.unmount()
})

test('zoomed out with borders on, after decades of growth, the map still draws', async ($, on) => {
  const { ui } = await setup($, on)
  await ui.press({ key: 'speed' })
  await ui.press({ key: 'speed' })
  await ui.advance(120 * 48 * 5)
  await ui.press({ key: 'zoom' })
  await ui.press({ key: 'borders' })
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  expect(String(svg?.props.source ?? '').length).toBeLessThan(131_072)
  await ui.unmount()
})

test('a click that places nothing says why', async ($, on) => {
  const { ui, frame, click } = await setup($, on)
  await ui.press({ key: 'pause' })
  await ui.select({ key: 'cat', value: 'terrain' })
  await ui.select({ key: 'tool', value: 'deep' })
  for (let n = 0; n < 4; n++) await ui.press({ key: 'brush-up' })
  await click(5, 5)
  await ui.select({ key: 'cat', value: 'life' })
  await ui.select({ key: 'tool', value: 'human' })
  await ui.press({ key: 'brush-down' })
  for (let n = 0; n < 6; n++) await ui.press({ key: 'brush-down' })
  await click(5, 5)
  expect((await frame()).log[0]).toMatch(/can't live there/)
  await ui.unmount()
})

test('the map settles to fit the room the panel leaves it', async ($, on) => {
  const { ui, rows, sync } = await setup($, on)
  // 44 rows of panel less the toolbar, header, info and gaps.
  expect(rows()).toBeLessThanOrEqual(34)
  expect(rows()).toBeGreaterThan(20)
  await ui.press({ key: 'zoom' })
  await sync()
  expect(rows()).toBeLessThanOrEqual(34)
  await ui.unmount()
})
