import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pet } from '../types'
import {
  HELP,
  MAX_PETS,
  TICK_MS,
  addPet,
  defaultPets,
  describePets,
  drawScene,
  emptyScene,
  findPet,
  parseCommand,
  react,
  step,
  throwBall,
  wake,
} from './pets'

const PLUGIN = 'claude-pets'
const BALL_BUTTON = 9

const petsAtom = atom({ plugin: 'claude-pets', key: 'pets' } as const, [])
const sceneAtom = atom({ plugin: 'claude-pets', key: 'scene' } as const, emptyScene(1))
const hiddenAtom = atom({ plugin: 'claude-pets', key: 'isHidden' } as const, false)

/** What this load of the module holds; a reload starts it over. */
const live = {
  /** The playground's width, as the band last measured it. */
  width: 60,
  sleepAfter: 0,
  reactions: true,
}

async function savePets($: EngineInterface, pets: Pet[]): Promise<void> {
  await update($, petsAtom, () => pets)
  await $.store.set('pets', pets)
}

async function setHidden($: EngineInterface, isHidden: boolean): Promise<void> {
  await update($, hiddenAtom, () => isHidden)
  await $.store.set('isHidden', isHidden)
}

async function tick($: EngineInterface): Promise<void> {
  if (await read($, hiddenAtom)) return
  const pets = await read($, petsAtom)
  if (pets.length === 0) return
  await update($, sceneAtom, scene => step(scene, pets, live.width, { sleepAfter: live.sleepAfter }))
}

async function run($: EngineInterface, args: string): Promise<string> {
  const command = parseCommand(args)
  const pets = await read($, petsAtom)
  switch (command.kind) {
    case 'help':
      return `${describePets(pets)}\n\n${HELP}`
    case 'list':
      return describePets(pets)
    case 'add': {
      if (pets.length >= MAX_PETS) return `The playground is full (${MAX_PETS} pets). Say goodbye to one first: /pet remove <name>.`
      const now = addPet(pets, command.species, command.name)
      await savePets($, now)
      await setHidden($, false)
      const added = now[now.length - 1]
      return added === undefined ? 'Added.' : `${added.name} the ${added.species} joined the playground.`
    }
    case 'remove': {
      const pet = findPet(pets, command.who)
      if (pet === undefined) return `No pet called "${command.who}". ${describePets(pets)}`
      await savePets($, pets.filter(one => one.id !== pet.id))
      return `Bye, ${pet.name}!`
    }
    case 'rename': {
      const pet = findPet(pets, command.who)
      if (pet === undefined) return `No pet called "${command.who}". ${describePets(pets)}`
      await savePets($, pets.map(one => (one.id === pet.id ? { ...one, name: command.name } : one)))
      return `${pet.name} is now called ${command.name}.`
    }
    case 'ball':
      if (pets.length === 0) return 'Nobody to play with. Add a pet first: /pet add cat'
      await setHidden($, false)
      await update($, sceneAtom, scene => throwBall(scene, live.width))
      return 'Fetch! ●'
    case 'hide':
      await setHidden($, true)
      return 'The pets are napping out of sight. /pet show brings them back.'
    case 'show':
      await setHidden($, false)
      return pets.length === 0 ? 'No pets yet. Add one: /pet add cat' : 'Here they are!'
    case 'error':
      return command.text
  }
}

export const register: Register = (on, options) => {
  const minutes = typeof options.sleepAfterMinutes === 'number' ? Math.max(0, options.sleepAfterMinutes) : 5
  live.sleepAfter = Math.round((minutes * 60_000) / TICK_MS)
  live.reactions = options.reactions !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'pet',
      description: 'Your pets above the prompt: /pet add cat, /pet ball, /pet list, /pet remove <name>',
      argumentHint: '[add <clawd|cat|dog|crab|fox|duck|rabbit|snake> [name] | ball | list | rename | remove | hide | show]',
      immediate: true,
    })
    const stored = await $.store.get('pets')
    await update($, petsAtom, () => (Array.isArray(stored) ? (stored as Pet[]) : defaultPets()))
    const isHidden = (await $.store.get('isHidden')) === true
    await update($, hiddenAtom, () => isHidden)
    const seed = (await $.clock.now()) % 100_000
    // A reload keeps the scene running; a new session starts a fresh one.
    await update($, sceneAtom, scene => (scene.tick > 0 ? scene : emptyScene(seed + 7)))
    $.clock.every(TICK_MS, () => void tick($).catch(() => undefined))

    return started
  })

  on('command.run', { command: 'pet' }, async ($, e) => ({ text: await run($, e.args) }))

  on('prompt.submit', async ($, e, next) => {
    await update($, sceneAtom, wake)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await update($, sceneAtom, scene => (live.reactions ? react(wake(scene), 'happy') : wake(scene)))
    return done
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (live.reactions && 'isError' in ran && ran.isError === true) await update($, sceneAtom, scene => react(scene, 'sad'))
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenAtom))) return next(e)
    const pets = await read($, petsAtom)
    if (pets.length === 0) return next(e)
    const scene = await read($, sceneAtom)
    live.width = Math.max(20, e.props.bodyColumns - BALL_BUTTON)
    const rows = drawScene(scene, pets, live.width)
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="flex-end">
          <Box flexDirection="column">
            {rows.map(runs => (
              <Text wrap="truncate">
                {runs.map(one => (one.color === undefined ? one.text : <Text color={one.color}>{one.text}</Text>))}
              </Text>
            ))}
          </Box>
          <Button
            key="ball"
            label="ball"
            hotkey="b"
            onPress={() => update($, sceneAtom, s => throwBall(wake(s), live.width))}
          />
        </Box>
        {below}
      </Box>
    )
  })
}
