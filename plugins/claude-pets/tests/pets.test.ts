import { describe, expect, test } from 'claude-code/testing'

import {
  SPECIES,
  addPet,
  defaultPets,
  drawScene,
  emptyScene,
  findPet,
  nameFor,
  parseCommand,
  react,
  spriteRows,
  spriteWidth,
  step,
  throwBall,
  wake,
} from '../hooks/pets'
import type { Pet, Scene } from '../types'

const WIDTH = 60
const awake = { sleepAfter: 0 }

function run(scene: Scene, pets: Pet[], ticks: number, sleepAfter = 0): Scene {
  let now = scene
  for (let i = 0; i < ticks; i += 1) now = step(now, pets, WIDTH, { sleepAfter })
  return now
}

describe('sprites', () => {
  test('every frame of every pet is one width, both ways round', () => {
    for (const species of SPECIES) {
      const w = spriteWidth(species)
      for (const frame of [0, 1]) {
        for (const dir of [1, -1] as const) {
          for (const row of spriteRows(species, frame, 'normal', dir)) expect(Array.from(row).length).toBe(w)
        }
      }
    }
  })

  test('a pet facing left is the mirror of one facing right', () => {
    expect(spriteRows('duck', 0, 'normal', 1)[1]).toBe('_( o>')
    expect(spriteRows('duck', 0, 'normal', -1)[1]).toBe('<o )_')
    expect(spriteRows('cat', 0, 'happy', 1)[1]).toContain('^.^')
  })
})

describe('the playground', () => {
  const pets = addPet(defaultPets(), 'cat')

  test('one actor per pet, always inside the playground', () => {
    const scene = run(emptyScene(42), pets, 400)
    expect(scene.actors.map(actor => actor.id)).toEqual(pets.map(pet => pet.id))
    for (const actor of scene.actors) {
      expect(actor.x).toBeGreaterThanOrEqual(0)
      expect(actor.x).toBeLessThanOrEqual(WIDTH)
    }
  })

  test('steps are reproducible from the seed', () => {
    expect(run(emptyScene(7), pets, 50)).toEqual(run(emptyScene(7), pets, 50))
  })

  test('a removed pet leaves the playground', () => {
    const scene = run(emptyScene(3), pets, 5)
    expect(step(scene, pets.slice(0, 1), WIDTH, awake).actors).toHaveLength(1)
  })

  test('a thrown ball is chased and caught', () => {
    let scene = throwBall(run(emptyScene(9), pets, 3), WIDTH)
    expect(scene.ball).not.toBeNull()
    scene = step(scene, pets, WIDTH, awake)
    expect(scene.actors.some(actor => actor.mood === 'chase' || actor.mood === 'happy')).toBe(true)
    scene = run(scene, pets, 120)
    expect(scene.ball).toBeNull()
  })

  test('pets fall asleep when nothing happens, and wake up', () => {
    const asleep = run(emptyScene(5), pets, 300, 20)
    expect(asleep.actors.every(actor => actor.mood === 'sleep')).toBe(true)
    const woken = step(wake(asleep), pets, WIDTH, { sleepAfter: 20 })
    expect(woken.actors.some(actor => actor.mood === 'sleep')).toBe(false)
  })

  test('a pet cheers', () => {
    const scene = react(run(emptyScene(11), pets, 2), 'happy')
    expect(scene.actors.filter(actor => actor.mood === 'happy' && actor.bubble === '♥')).toHaveLength(1)
  })

  test('draws as many cells as the playground is wide', () => {
    const scene = run(emptyScene(1), pets, 10)
    const rows = drawScene(scene, pets, WIDTH)
    expect(rows).toHaveLength(3)
    for (const runs of rows) expect(Array.from(runs.map(one => one.text).join('')).length).toBe(WIDTH)
  })
})

describe('the /pet command', () => {
  test('reads what you type', () => {
    expect(parseCommand('')).toEqual({ kind: 'help' })
    expect(parseCommand('add cat')).toEqual({ kind: 'add', species: 'cat' })
    expect(parseCommand('add dog Sir Barksalot')).toEqual({ kind: 'add', species: 'dog', name: 'Sir Barksalot' })
    expect(parseCommand('crab')).toEqual({ kind: 'add', species: 'crab' })
    expect(parseCommand('add bunny')).toEqual({ kind: 'add', species: 'rabbit' })
    expect(parseCommand('ball')).toEqual({ kind: 'ball' })
    expect(parseCommand('remove Luna')).toEqual({ kind: 'remove', who: 'Luna' })
    expect(parseCommand('rename Luna Nova')).toEqual({ kind: 'rename', who: 'Luna', name: 'Nova' })
    expect(parseCommand('add unicorn').kind).toBe('error')
    expect(parseCommand('dance').kind).toBe('error')
  })

  test('names pets and finds them again', () => {
    let pets = defaultPets()
    pets = addPet(pets, 'cat')
    pets = addPet(pets, 'cat')
    expect(pets.map(pet => pet.name)).toEqual(['Clawd', 'Whiskers', 'Luna'])
    expect(new Set(pets.map(pet => pet.id)).size).toBe(3)
    expect(findPet(pets, 'luna')?.id).toBe('cat-2')
    expect(findPet(pets, 'cat')?.name).toBe('Luna')
    expect(nameFor('clawd', [{ id: 'a', name: 'Clawd', species: 'clawd' }])).toBe('Clawdette')
  })
})
