import { describe, expect, test } from 'claude-code/testing'

import { classify } from '../hooks/activity'
import { petScene } from '../hooks/art'
import { decay, fedStreak, migrate, moodOf, newPet, reduce, stageOf, xpToNext } from '../hooks/core'
import type { Settings } from '../hooks/core'
import { bar, spriteRows, speciesOf } from '../hooks/draw'
import { BUILT_IN, addTo, emptyRegistry, mergeRegistry } from '../hooks/registry'
import type { CodingPetAction, CodingPetState } from '../types'

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0)
const HOUR = 3_600_000
const normal: Settings = { difficulty: 'normal' }

const pet = (): CodingPetState => newPet('Byte', 'blob', T0)
const act = (from: CodingPetState, action: CodingPetAction, at = T0) => reduce(from, action, at, BUILT_IN, normal)

describe('levels', () => {
  test('each level takes more XP than the last', () => {
    expect(xpToNext(1)).toBe(50)
    expect(xpToNext(4)).toBe(400)
    for (let level = 1; level < 40; level++) expect(xpToNext(level + 1)).toBeGreaterThan(xpToNext(level))
  })

  test('stages start at levels 1, 3, 10 and 25', () => {
    expect(stageOf(1)).toBe('egg')
    expect(stageOf(2)).toBe('egg')
    expect(stageOf(3)).toBe('baby')
    expect(stageOf(10)).toBe('teen')
    expect(stageOf(30)).toBe('adult')
  })

  test('XP rolls over into as many levels as it covers, and the egg hatches', () => {
    // 50 + 141 to reach level 3; another plugin's grants are capped at 50 each.
    let now = pet()
    const effects = []
    for (let i = 0; i < 4; i++) {
      const done = act(now, { kind: 'activity', activity: 'bonus', xp: 50 }, T0 + i * 2_000)
      now = done.pet
      effects.push(...done.effects)
    }
    expect(now.totalXp).toBe(200)
    expect(now.level).toBe(3)
    expect(now.xp).toBe(200 - 50 - xpToNext(2))
    expect(effects).toContainEqual({ kind: 'levelUp', level: 2 })
    expect(effects).toContainEqual({ kind: 'evolved', stage: 'baby' })
    expect(now.achievements).toContain('hatched')
  })
})

describe('activities', () => {
  test('an edit earns its XP, counts, and costs a little energy', () => {
    const { pet: after, effects } = act(pet(), { kind: 'activity', activity: 'edit' })
    expect(after.xp).toBe(5)
    expect(after.totals.edit).toBe(1)
    expect(after.today.xp.edit).toBe(5)
    expect(after.stats.energy).toBe(79)
    expect(effects[0]).toEqual({ kind: 'xp', activity: 'edit', xp: 5 })
    expect(after.achievements).toContain('first-edit')
  })

  test('within its cooldown an activity counts but earns nothing', () => {
    const once = act(pet(), { kind: 'activity', activity: 'read' }).pet
    const twice = act(once, { kind: 'activity', activity: 'read' }, T0 + 1_000).pet
    expect(twice.totals.read).toBe(2)
    expect(twice.xp).toBe(2)
    const later = act(twice, { kind: 'activity', activity: 'read' }, T0 + 6_000).pet
    expect(later.xp).toBe(4)
  })

  test('a hungry pet learns at half speed', () => {
    const hungry = { ...pet(), stats: { happiness: 50, energy: 80, fullness: 10 } }
    expect(act(hungry, { kind: 'activity', activity: 'commit' }).pet.xp).toBe(10)
  })

  test('a failed tool makes it sadder and earns nothing', () => {
    const after = act(pet(), { kind: 'activity', activity: 'toolFail' }).pet
    expect(after.xp).toBe(0)
    expect(after.stats.happiness).toBe(67)
  })
})

describe('care', () => {
  test('feeding fills it up, records the day, and the same food has a cooldown', () => {
    const fed = act(pet(), { kind: 'feed', food: 'pizza' })
    expect(fed.pet.stats.fullness).toBe(100)
    expect(fed.pet.fedDays).toEqual(['2026-10-07'])
    expect(fed.effects.some(one => one.kind === 'said')).toBe(true)
    const again = act({ ...fed.pet, stats: { ...fed.pet.stats, fullness: 50 } }, { kind: 'feed', food: 'pizza' }, T0 + 60_000)
    expect(again.effects[0]?.kind).toBe('refused')
  })

  test('a full pet refuses food; an unknown food is refused', () => {
    const full = { ...pet(), stats: { happiness: 50, energy: 50, fullness: 98 } }
    expect(act(full, { kind: 'feed', food: 'apple' }).effects[0]?.kind).toBe('refused')
    expect(act(pet(), { kind: 'feed', food: 'sushi' }).effects[0]).toMatchObject({ kind: 'refused' })
  })

  test('playing cheers it up but tires it; too tired, it will not', () => {
    const played = act(pet(), { kind: 'play' }).pet
    expect(played.stats.happiness).toBe(85)
    expect(played.stats.energy).toBe(70)
    const tired = { ...pet(), stats: { happiness: 50, energy: 10, fullness: 50 } }
    expect(act(tired, { kind: 'play' }).effects[0]?.kind).toBe('refused')
  })

  test('rest puts it to sleep, it recovers fast, and rest again wakes it', () => {
    const tired = { ...pet(), stats: { happiness: 50, energy: 10, fullness: 80 } }
    const asleep = act(tired, { kind: 'rest' }).pet
    expect(moodOf(asleep, T0 + 60_000, true)).toBe('sleeping')
    expect(act(asleep, { kind: 'play' }, T0 + 60_000).effects[0]?.kind).toBe('refused')
    const rested = decay(asleep, T0 + 20 * 60_000, normal)
    expect(rested.stats.energy).toBe(30)
    expect(moodOf(rested, T0 + 20 * 60_000, false)).not.toBe('sleeping')
    const woken = act(asleep, { kind: 'rest' }, T0 + 60_000).pet
    expect(woken.sleepingUntil).toBe(0)
  })
})

describe('time', () => {
  test('it gets hungry over hours, never past the floors, and decays at most a week', () => {
    const later = decay(pet(), T0 + 5 * HOUR, normal)
    expect(later.stats.fullness).toBe(40)
    expect(later.stats.energy).toBe(100)
    const month = decay(pet(), T0 + 30 * 24 * HOUR, normal)
    expect(month.stats.fullness).toBe(0)
    expect(month.stats.happiness).toBe(5)
    expect(decay(pet(), T0 + 5 * HOUR, { difficulty: 'chill' }).stats.fullness).toBe(55)
  })

  test('mood follows the stats, most pressing first', () => {
    const base = pet()
    expect(moodOf(base, T0, true)).toBe('coding')
    expect(moodOf({ ...base, stats: { happiness: 90, energy: 90, fullness: 90 } }, T0, false)).toBe('happy')
    expect(moodOf({ ...base, stats: { happiness: 90, energy: 10, fullness: 10 } }, T0, false)).toBe('hungry')
    expect(moodOf({ ...base, stats: { happiness: 10, energy: 10, fullness: 90 } }, T0, false)).toBe('tired')
    expect(moodOf({ ...base, stats: { happiness: 10, energy: 90, fullness: 90 } }, T0, false)).toBe('sad')
  })

  test('the feeding streak counts days in a row up to today or yesterday', () => {
    expect(fedStreak(['2026-10-05', '2026-10-06', '2026-10-07'], T0)).toBe(3)
    expect(fedStreak(['2026-10-05', '2026-10-06'], T0)).toBe(2)
    expect(fedStreak(['2026-10-03', '2026-10-05'], T0)).toBe(0)
  })

  test('XP earned on another day starts a new today', () => {
    const first = act(pet(), { kind: 'activity', activity: 'edit' }).pet
    // A day alone leaves it hungry, so it learns at half speed.
    const next = act(first, { kind: 'activity', activity: 'edit' }, T0 + 24 * HOUR).pet
    expect(next.today).toEqual({ date: '2026-10-08', xp: { edit: 2 } })
  })
})

describe('storage', () => {
  test('an old stored pet gains the new fields; junk is no pet', () => {
    const old = { name: 'Rex', species: 'cat', level: 4, xp: 12, stats: { happiness: 40 } }
    const migrated = migrate(old, T0)
    expect(migrated?.level).toBe(4)
    expect(migrated?.stats).toEqual({ happiness: 40, energy: 80, fullness: 70 })
    expect(migrated?.achievements).toEqual([])
    expect(migrate('nope', T0)).toBeNull()
    expect(migrate({ level: 3 }, T0)).toBeNull()
  })
})

describe('signals', () => {
  const rules = BUILT_IN.activities
  const bash = (command: string, isError = false) => classify({ on: 'tool', tool: 'Bash', command, isError }, rules)

  test('edits, reads, prompts and turns', () => {
    expect(classify({ on: 'tool', tool: 'Edit', isError: false }, rules)).toBe('edit')
    expect(classify({ on: 'tool', tool: 'Write', isError: false }, rules)).toBe('edit')
    expect(classify({ on: 'tool', tool: 'Read', isError: false }, rules)).toBe('read')
    expect(classify({ on: 'tool', tool: 'Grep', isError: false }, rules)).toBeUndefined()
    expect(classify({ on: 'prompt' }, rules)).toBe('prompt')
    expect(classify({ on: 'turn' }, rules)).toBe('turn')
  })

  test('test runs and commits in a shell', () => {
    expect(bash('npm test')).toBe('test')
    expect(bash('npm run test -- --watch=false')).toBe('test')
    expect(bash('cd app && pytest -q')).toBe('test')
    expect(bash('cargo test --all')).toBe('test')
    expect(bash('go test ./...')).toBe('test')
    expect(bash('claude plugin test plugins/coding-pet')).toBe('test')
    expect(bash('git commit -m "x"')).toBe('commit')
    expect(bash('git -C repo commit -am x')).toBe('commit')
    expect(classify({ on: 'tool', tool: 'PowerShell', command: 'git commit -m x', isError: false }, rules)).toBe('commit')
    expect(bash('ls -la')).toBeUndefined()
    expect(bash('npm install attest')).toBeUndefined()
    expect(bash('git log --grep commit')).toBeUndefined()
  })

  test('a failing test run is a failed tool, not a pass', () => {
    expect(bash('npm test', true)).toBe('toolFail')
    expect(classify({ on: 'tool', tool: 'Edit', isError: true }, rules)).toBe('toolFail')
  })

  test("another plugin's activity claims its signal before the built-in rules", () => {
    const extra = addTo(emptyRegistry(), 'activities', {
      kind: 'lint', label: 'Lint runs', xp: 4, on: 'tool', tools: ['Bash'], command: '\\beslint\\b',
    })
    const merged = mergeRegistry(BUILT_IN, extra)
    expect(classify({ on: 'tool', tool: 'Bash', command: 'npx eslint .', isError: false }, merged.activities)).toBe('lint')
    expect(reduce(pet(), { kind: 'activity', activity: 'lint' }, T0, merged, normal).pet.xp).toBe(4)
  })
})

describe('drawing', () => {
  test('every frame of every species and stage is one width', () => {
    for (const species of BUILT_IN.species) {
      for (const level of [1, 3, 10, 25]) {
        for (const mood of ['ok', 'coding', 'sleeping', 'happy'] as const) {
          for (let frame = 0; frame < 4; frame++) {
            const rows = spriteRows({ ...pet(), level }, speciesOf(BUILT_IN, species.id), mood, frame)
            const widths = new Set(rows.map(row => Array.from(row).length))
            expect(widths.size).toBe(1)
            expect(rows.length).toBe(3)
          }
        }
      }
    }
  })

  test('bars fill in proportion', () => {
    expect(bar(50, 100, 10)).toBe('█████░░░░░')
    expect(bar(150, 100, 4)).toBe('████')
    expect(bar(0, 0, 3)).toBe('░░░')
  })

  test('the picture draws every species, stage and mood', () => {
    const moods = ['ok', 'happy', 'coding', 'sleeping', 'hungry', 'tired', 'sad'] as const
    for (const species of BUILT_IN.species) {
      for (const stage of ['egg', 'baby', 'teen', 'adult'] as const) {
        for (const mood of moods) {
          const svg = petScene(species, stage, mood)
          expect(svg.startsWith('<svg')).toBe(true)
          expect(svg.endsWith('</svg>')).toBe(true)
          expect(svg.length).toBeLessThan(131_072)
        }
      }
    }
  })

  test('the picture does not change with XP or stats, so it never reloads for them', () => {
    const species = speciesOf(BUILT_IN, 'cat')
    const before = act(pet(), { kind: 'activity', activity: 'edit' }).pet
    const after = act(before, { kind: 'activity', activity: 'commit' }, T0 + 5_000).pet
    expect(petScene(species, stageOf(after.level), 'ok')).toBe(petScene(species, stageOf(before.level), 'ok'))
    expect(after.totalXp).toBeGreaterThan(before.totalXp)
  })
})
