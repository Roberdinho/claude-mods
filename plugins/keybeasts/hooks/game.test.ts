import { expect, test } from 'claude-code/testing'

import type { Rarity, Save } from '../types'
import { BEASTS, CHEST_MINUTES, EGG_DUPLICATE_BONUS, EGG_MINUTES, ITEMS, RARITIES } from './data'
import {
  buyBeast,
  chooseStarter,
  emoteFor,
  exchange,
  hatch,
  migrate,
  newSave,
  openChest,
  rollRarity,
  seeded,
  tickClock,
  tickMinute,
  toggleEmote,
  toggleEquip,
} from './game'

const started = () => chooseStarter(newSave(), 'hond').save

test('de drop-verdeling volgt de rarity-kansen', async () => {
  const rng = seeded(42)
  const counts: Record<Rarity, number> = { gewoon: 0, ongewoon: 0, zeldzaam: 0, episch: 0, legendarisch: 0 }
  const n = 1_000_000
  for (let i = 0; i < n; i++) counts[rollRarity(rng)]++
  expect(Math.abs(counts.gewoon / n - 0.9)).toBeLessThan(0.003)
  expect(Math.abs(counts.ongewoon / n - 0.095)).toBeLessThan(0.003)
  expect(Math.abs(counts.zeldzaam / n - 0.0049)).toBeLessThan(0.0008)
  expect(counts.episch).toBeLessThan(250)
  expect(counts.legendarisch).toBeLessThan(15)
})

test('elke rarity heeft items, zodat ruilen altijd iets oplevert', async () => {
  for (const r of RARITIES) expect(ITEMS.some(i => i.rarity === r)).toBe(true)
})

test('alleen een starter kan als eerste gekozen worden', async () => {
  expect(chooseStarter(newSave(), 'konijn').error).toBeDefined()
  const s = started()
  expect(s.owned).toEqual(['hond'])
  expect(chooseStarter(s, 'kat').error).toBeDefined()
})

test('ruilen: 10 vrije items worden 1 betere, minder wordt geweigerd', async () => {
  const s = { ...started(), inventory: { pet: 6, muts: 3 } }
  expect(exchange(s, 'gewoon', seeded(1)).error).toBeDefined()
  const r = exchange({ ...s, inventory: { pet: 6, muts: 4 } }, 'gewoon', seeded(1))
  expect(r.error).toBeUndefined()
  const left = Object.entries(r.save.inventory)
  expect(left.length).toBe(1)
  expect(ITEMS.find(i => i.id === left[0]![0])?.rarity).toBe('ongewoon')
})

test('ruilen laat uitgeruste items staan', async () => {
  let s: Save = { ...started(), inventory: { pet: 10 } }
  s = toggleEquip(s, 'pet').save
  expect(exchange(s, 'gewoon', seeded(1)).error).toBeDefined()
})

test('de kist-timer telt alleen actieve minuten', async () => {
  let s = { ...started(), chests: 0 }
  for (let i = 0; i < CHEST_MINUTES * 2; i++) s = tickMinute(s, false, seeded(i)).save
  expect(s.chests).toBe(0)
  for (let i = 0; i < CHEST_MINUTES; i++) s = tickMinute(s, true, seeded(i)).save
  expect(s.chests).toBe(1)
  expect(s.stats.activeMinutes).toBe(CHEST_MINUTES)
})

test('een ei komt uit na genoeg actieve minuten, met een nieuw beestje', async () => {
  let s = { ...started(), eggs: [{ id: 'e1', progress: 0 }] }
  for (let i = 0; i < EGG_MINUTES - 1; i++) s = tickMinute(s, true, seeded(i)).save
  expect(s.eggs.length).toBe(1)
  s = tickMinute(s, true, seeded(7)).save
  expect(s.eggs.length).toBe(0)
  expect(s.owned.length).toBe(2)
  expect(BEASTS.find(b => b.id === s.owned[1])?.isStarter).toBe(false)
})

test('een ei geeft nooit een beestje dat je al hebt, anders keys', async () => {
  const all = { ...started(), owned: BEASTS.map(b => b.id), keys: 0 }
  const r = hatch(all, seeded(3))
  expect(r.save.owned.length).toBe(BEASTS.length)
  expect(r.save.keys).toBe(EGG_DUPLICATE_BONUS)
  const almost = { ...started(), owned: BEASTS.filter(b => b.id !== 'axolotl').map(b => b.id) }
  for (let i = 0; i < 20; i++) expect(hatch(almost, seeded(i)).save.owned.includes('axolotl')).toBe(true)
})

test('kopen wordt geweigerd bij te weinig keys', async () => {
  const s = { ...started(), keys: 100 }
  expect(buyBeast(s, 'konijn').error).toBeDefined()
  expect(buyBeast(s, 'axolotl').error).toBeDefined()
  const r = buyBeast({ ...s, keys: 1_500 }, 'konijn')
  expect(r.save.owned).toContain('konijn')
  expect(r.save.keys).toBe(0)
})

test('een kist openen kost een kist en geeft iets', async () => {
  const s = { ...started(), chests: 1 }
  const r = openChest(s, seeded(5))
  expect(r.save.chests).toBe(0)
  expect(r.drop).toBeDefined()
  expect(openChest(r.save, seeded(5)).error).toBeDefined()
})

test('oude of kapotte opslag wordt veilig ingelezen', async () => {
  expect(migrate(undefined).owned).toEqual([])
  expect(migrate({ v: 99, keys: 5 }).keys).toBe(0)
  const m = migrate({ v: 1, keys: 12, owned: ['kat', 'draak'], stats: { toolCalls: 3 } })
  expect(m.owned).toEqual(['kat'])
  expect(m.active).toBe('kat')
  expect(m.stats.toolCalls).toBe(3)
  expect(m.stats.turns).toBe(0)
})

test('een bandana uit een oude opslag wordt een propellerpet', async () => {
  const m = migrate({
    v: 1,
    owned: ['kat'],
    inventory: { bandana: 2, propellerpet: 1, pet: 1 },
    equipped: { kat: { hoed: 'bandana', instrument: 'drums' } },
  })
  expect(m.inventory).toEqual({ propellerpet: 3, pet: 1 })
  expect(m.equipped.kat).toEqual({ hoed: 'propellerpet', instrument: 'drums' })
  expect(ITEMS.some(i => i.id === 'bandana')).toBe(false)
})

test('twee sessies in dezelfde klokminuut tellen die minuut maar één keer', async () => {
  const now = 50 * 60_000 + 30_000
  let s = { ...started(), chestProgress: 0, lastEventAt: now - 5_000 }
  s = tickClock(s, now, 0, seeded(1)).save // sessie A
  s = tickClock(s, now + 2_000, 0, seeded(2)).save // sessie B, zelfde minuut
  expect(s.chestProgress).toBe(1)
  expect(s.stats.activeMinutes).toBe(1)
  s = tickClock(s, now + 60_000, now + 30_000, seeded(3)).save // volgende minuut, lokaal actief
  expect(s.stats.activeMinutes).toBe(2)
})

test('emotes reageren alleen als je ze bezit en niet hebt uitgezet', async () => {
  const none = started()
  expect(emoteFor(none, 'beurt')).toBe(null)
  const s = { ...started(), inventory: { hartje: 1, vuur: 1, uitroep: 1, zzz: 1 } }
  expect(emoteFor(s, 'beurt')).toBe('hartje')
  expect(emoteFor(s, 'tool-fout')).toBe('uitroep')
  expect(emoteFor(s, 'slapen')).toBe('zzz')
  const off = toggleEmote(s, 'hartje').save
  expect(emoteFor(off, 'beurt')).toBe(null)
  expect(emoteFor(toggleEmote(off, 'hartje').save, 'beurt')).toBe('hartje')
})

test('vuur verschijnt bij elke 5 gelukte tool-calls op rij', async () => {
  const s = { ...started(), inventory: { vuur: 1 } }
  expect(emoteFor(s, 'tool-ok', 4)).toBe(null)
  expect(emoteFor(s, 'tool-ok', 5)).toBe('vuur')
  expect(emoteFor(s, 'tool-ok', 6)).toBe(null)
  expect(emoteFor(s, 'tool-ok', 10)).toBe('vuur')
})

test('ruilen houdt één exemplaar van een emote die aan staat', async () => {
  const s = { ...started(), inventory: { hartje: 10 } }
  expect(exchange(s, 'gewoon', seeded(1)).error).toBeDefined()
  const off = toggleEmote(s, 'hartje').save
  expect(exchange(off, 'gewoon', seeded(1)).error).toBeUndefined()
})
