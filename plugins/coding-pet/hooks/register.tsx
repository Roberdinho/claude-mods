import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  CodingPet,
  CodingPetAction,
  CodingPetEffect,
  CodingPetMood,
  CodingPetRegistry,
  CodingPetState,
} from '../types'
import { classify, commandOf } from './activity'
import { SCENE, petScene } from './art'
import type { Signal } from './activity'
import { decay, migrate, moodOf, needsOf, newPet, reduce, stageOf, viewOf, xpToNext } from './core'
import type { Difficulty, Settings } from './core'
import { HELP, MOOD_LABEL, bar, bubbleOf, describe, iconOf, isSameView, paneViewOf, speciesOf, spriteRows, statColor, statusLine } from './draw'
import { BUILT_IN, addTo, emptyRegistry, mergeRegistry } from './registry'

const PLUGIN = 'coding-pet'
const PANE = 'coding-pet'
const PET_STATUS = `mcp__${PLUGIN}__pet_status`
/** Milliseconds per animation frame. */
const FRAME_MS = 500
const MINUTE = 60_000

const petAtom = atom({ plugin: 'coding-pet', key: 'pet' } as const, null)
const extensionsAtom = atom({ plugin: 'coding-pet', key: 'extensions' } as const, emptyRegistry())
const frameAtom = atom({ plugin: 'coding-pet', key: 'frame' } as const, 0)
const hiddenAtom = atom({ plugin: 'coding-pet', key: 'isHidden' } as const, false)
const busyAtom = atom({ plugin: 'coding-pet', key: 'isBusy' } as const, false)
const paneOpenAtom = atom({ plugin: 'coding-pet', key: 'isPaneOpen' } as const, false)
const stripClosedAtom = atom({ plugin: 'coding-pet', key: 'isStripClosed' } as const, false)
const paneViewAtom = atom({ plugin: 'coding-pet', key: 'paneView' } as const, null)

/** What this load of the module holds; a reload starts it over. */
const live = {
  settings: { difficulty: 'normal' } as Settings,
  petName: '',
  species: 'blob',
  showBand: true,
  statusLine: false,
  xpForReads: true,
  notifyNeeds: true,
  modelTool: false,
  /** The needs already toasted, so each is said once until it is met. */
  notified: new Set<string>(),
  /** The window's height in rows, as the band last saw it; the panel asks for half. */
  windowRows: 0,
  /** The animation timer; it only runs while the pet shows. */
  animation: undefined as ReturnType<EngineInterface['clock']['every']> | undefined,
}

const DIFFICULTIES: readonly Difficulty[] = ['chill', 'normal', 'hardcore']

async function registryOf($: EngineInterface): Promise<CodingPetRegistry> {
  const base = live.xpForReads
    ? BUILT_IN
    : { ...BUILT_IN, activities: BUILT_IN.activities.map(rule => (rule.kind === 'read' ? { ...rule, xp: 0 } : rule)) }
  return mergeRegistry(base, await read($, extensionsAtom))
}

/** The words for what an action caused, one line each; XP alone goes unsaid. */
function linesOf(effects: readonly CodingPetEffect[], name: string): string[] {
  return effects.flatMap(effect => {
    switch (effect.kind) {
      case 'said':
      case 'refused':
        return [effect.text]
      case 'levelUp':
        return [`🎉 ${name} reached level ${effect.level}!`]
      case 'evolved':
        return [effect.stage === 'baby' ? `🐣 ${name} hatched!` : `✨ ${name} grew into ${effect.stage === 'adult' ? 'an adult' : 'a teen'}!`]
      case 'achievement':
        return [`🏆 Achievement: ${effect.emoji} ${effect.title}`]
      case 'xp':
        return []
    }
  })
}

async function showStatus($: EngineInterface, pet: CodingPetState, mood: CodingPetMood, registry: CodingPetRegistry): Promise<void> {
  const isShown = live.statusLine && !(await read($, hiddenAtom))
  $.ui.status(isShown ? statusLine(pet, speciesOf(registry, pet.species), mood) : undefined)
}

/**
 * Toasts the milestones of an action, and each new need once. A hidden pet is
 * silent: it still notes its needs, so showing it again does not replay them.
 */
async function announce($: EngineInterface, pet: CodingPetState, effects: readonly CodingPetEffect[], now: number): Promise<void> {
  const registry = await registryOf($)
  const isQuiet = await read($, hiddenAtom)
  const milestones = linesOf(effects.filter(one => one.kind === 'levelUp' || one.kind === 'evolved' || one.kind === 'achievement'), pet.name)
  if (!isQuiet) for (const line of milestones) $.ui.toast(line)

  const needs = needsOf(pet)
  for (const need of [...live.notified]) if (!needs.includes(need as never)) live.notified.delete(need)
  if (live.notifyNeeds && pet.sleepingUntil <= now) {
    for (const need of needs) {
      if (live.notified.has(need)) continue
      live.notified.add(need)
      if (isQuiet) continue
      const hint = need === 'hungry' ? '/codepet feed' : need === 'tired' ? '/codepet rest' : '/codepet play'
      $.ui.toast(`${iconOf(pet, speciesOf(registry, pet.species))} ${pet.name} is ${need}. Try ${hint}.`)
    }
  }
  await showStatus($, pet, moodOf(pet, now, await read($, busyAtom)), registry)
}

/**
 * Brings the panel's view up to date, writing it only when what it shows
 * changed: a write redraws the panel, and a redraw reloads its picture.
 */
async function refreshPane($: EngineInterface): Promise<void> {
  const pet = await read($, petAtom)
  const view = pet === null ? null : paneViewOf(pet, await registryOf($), moodOf(pet, await $.clock.now(), await read($, busyAtom)))
  if (!isSameView(await read($, paneViewAtom), view)) await update($, paneViewAtom, () => view)
}

/** Applies an action to the pet, keeps it, and says what it caused. */
async function dispatch($: EngineInterface, action: CodingPetAction): Promise<CodingPetEffect[]> {
  const now = await $.clock.now()
  const registry = await registryOf($)
  let effects: CodingPetEffect[] = []
  let after: CodingPetState | null = null
  await update($, petAtom, pet => {
    if (pet === null) return pet
    const reduced = reduce(pet, action, now, registry, live.settings)
    effects = reduced.effects
    after = reduced.pet
    return reduced.pet
  })
  const pet = after as CodingPetState | null
  if (pet === null) return []
  await $.store.set('pet', pet)
  await refreshPane($)
  await announce($, pet, effects, now)

  return effects
}

async function signal($: EngineInterface, happened: Signal): Promise<void> {
  const kind = classify(happened, (await registryOf($)).activities)
  if (kind !== undefined) await dispatch($, { kind: 'activity', activity: kind })
}

/** Starts or stops the animation frames. */
function animate($: EngineInterface, isOn: boolean): void {
  if (!isOn) {
    live.animation?.cancel()
    live.animation = undefined
    return
  }
  live.animation ??= $.clock.every(FRAME_MS, () => void update($, frameAtom, frame => (frame + 1) % 1_000_000).catch(() => undefined))
}

/** Closes the panel, and lets the strip above the prompt step back in. */
async function closePane($: EngineInterface): Promise<void> {
  await $.ui.close({ id: PANE })
  await update($, paneOpenAtom, () => false)
}

/** Puts the strip above the prompt away (it keeps toasting) or brings it back. */
async function setStripClosed($: EngineInterface, isClosed: boolean): Promise<void> {
  await update($, stripClosedAtom, () => isClosed)
  await $.store.set('isStripClosed', isClosed)
}

/** Hides the pet entirely (strip, panel, toasts, status line) or brings it back. */
async function setHidden($: EngineInterface, isHidden: boolean): Promise<void> {
  await update($, hiddenAtom, () => isHidden)
  await $.store.set('isHidden', isHidden)
  animate($, !isHidden)
  if (isHidden) await closePane($)
  const pet = await read($, petAtom)
  if (pet !== null) await showStatus($, pet, moodOf(pet, await $.clock.now(), await read($, busyAtom)), await registryOf($))
}

async function openPane($: EngineInterface): Promise<void> {
  const pet = await read($, petAtom)
  const rows = live.windowRows > 0 ? Math.max(10, Math.floor(live.windowRows / 2)) : 16
  await $.ui.open({ id: PANE, title: pet === null ? 'Coding pet' : `${pet.name} the coding pet`, focus: true, closeOnEscape: true, rows })
  // The panel stands in for the strip above the prompt while it is open.
  await update($, paneOpenAtom, () => true)
}

/** Presses a care button: the action, and its words as a toast. */
async function care($: EngineInterface, action: CodingPetAction): Promise<void> {
  const effects = await dispatch($, action)
  const pet = await read($, petAtom)
  const said = linesOf(effects.filter(one => one.kind === 'said' || one.kind === 'refused'), pet?.name ?? '')
  for (const line of said) $.ui.toast(line)
}

async function freshPet($: EngineInterface): Promise<CodingPetState> {
  const registry = await registryOf($)
  const species = speciesOf(registry, live.species)
  const name = live.petName !== '' ? live.petName : (species.names[0] ?? 'Byte')
  return { ...newPet(name, species.id, await $.clock.now()), configured: { name: live.petName, species: live.species } }
}

async function run($: EngineInterface, args: string): Promise<string> {
  const [first = '', ...rest] = args.trim().split(/\s+/)
  const word = first.toLowerCase()
  const tail = rest.join(' ').trim()
  const pet = await read($, petAtom)
  if (pet === null) return 'Your pet is not here yet; try again in a moment.'
  const say = async (action: CodingPetAction): Promise<string> => linesOf(await dispatch($, action), pet.name).join('\n') || 'Done.'

  switch (word) {
    case '':
      await setHidden($, false)
      await openPane($)
      return describe(pet, await registryOf($), moodOf(pet, await $.clock.now(), await read($, busyAtom)), await $.clock.now())
    case 'stats':
    case 'status':
    case 'info': {
      const now = await $.clock.now()
      const fresh = decay(pet, now, live.settings)
      return describe(fresh, await registryOf($), moodOf(fresh, now, await read($, busyAtom)), now)
    }
    case 'feed':
    case 'eat':
      return say(tail === '' ? { kind: 'feed' } : { kind: 'feed', food: tail })
    case 'play':
      return say({ kind: 'play' })
    case 'rest':
    case 'sleep':
    case 'nap':
    case 'wake':
      return say({ kind: 'rest' })
    case 'name':
    case 'rename':
      return say({ kind: 'rename', name: tail })
    case 'species':
      return say({ kind: 'species', species: tail })
    case 'foods':
    case 'menu':
      return (await registryOf($)).foods
        .map(food => `${food.emoji} ${food.id}: ${Object.entries(food.effect).map(([stat, n]) => `${stat} ${n > 0 ? '+' : ''}${n}`).join(', ')}`)
        .join('\n')
    case 'close':
      await closePane($)
      await setStripClosed($, true)
      return `${pet.name}'s panel and strip are closed. /codepet opens the panel, /codepet show brings the strip back.`
    case 'hide':
      await setHidden($, true)
      return `${pet.name} is hidden and silent: no strip, panel, toasts or status line. It still earns XP. /codepet show brings it back.`
    case 'show': {
      await setHidden($, false)
      await setStripClosed($, false)
      const now = await $.clock.now()
      const needs = needsOf(decay(pet, now, live.settings))
      return `${pet.name} is back above the prompt.${needs.length === 0 ? '' : ` It is ${needs.join(' and ')}.`}`
    }
    case 'reset': {
      if (tail.toLowerCase() !== 'confirm') return `This says goodbye to ${pet.name} (level ${pet.level}) and starts over with an egg. Sure? /codepet reset confirm`
      const egg = await freshPet($)
      await update($, petAtom, () => egg)
      await $.store.set('pet', egg)
      await refreshPane($)
      return `Goodbye, ${pet.name}. A new egg appears… meet ${egg.name}.`
    }
    case 'help':
      return HELP
    default:
      return `Unknown "${first}". ${HELP}`
  }
}

/**
 * `$.codingPet`'s methods. Each call is an event (`codingPet.award`, ...) that
 * this plugin's own hooks answer with the session's `$`; these bottoms only
 * answer when no hook of this plugin is loaded.
 */
const unavailable = (): Promise<never> => Promise.reject(new Error('coding-pet is not loaded'))
const api: CodingPet = {
  get: unavailable,
  award: unavailable,
  act: unavailable,
  addSpecies: unavailable,
  addFood: unavailable,
  addActivity: unavailable,
  addAchievement: unavailable,
}

export const register: Register = (on, options) => {
  live.petName = typeof options.petName === 'string' ? options.petName.trim().slice(0, 24) : ''
  live.species = typeof options.species === 'string' && options.species !== '' ? options.species : 'blob'
  live.showBand = options.showBand !== false
  live.statusLine = options.statusLine === true
  live.xpForReads = options.xpForReads !== false
  live.notifyNeeds = options.notifyNeeds !== false
  live.modelTool = options.modelTool === true
  const difficulty = DIFFICULTIES.find(one => one === options.difficulty)
  live.settings = { difficulty: difficulty ?? 'normal' }

  on('engine.create', async (_$, e, next) => ({ ...(await next(e)), codingPet: api }))

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'codepet',
      description: 'Your coding pet: /codepet opens it, feed, play, rest, stats, name',
      argumentHint: '[feed [food] | play | rest | stats | name <name> | species <kind> | foods | close | show | hide | reset]',
      immediate: true,
    })
    if (live.modelTool) {
      await $.tool.register({
        name: 'pet_status',
        description:
          "Says how the user's coding pet is doing: its name, level, XP, mood, happiness, energy, fullness, today's XP and achievements. Use it when the user asks about their pet.",
        inputSchema: { type: 'object', properties: {} },
      })
    }

    const now = await $.clock.now()
    const registry = await registryOf($)
    let pet = migrate(await $.store.get('pet'), now) ?? (await freshPet($))
    // A name or species changed in the settings applies once; /codepet name wins after that.
    if (live.petName !== '' && live.petName !== pet.configured.name) pet = { ...pet, name: live.petName }
    if (live.species !== pet.configured.species && registry.species.some(one => one.id === live.species)) pet = { ...pet, species: live.species }
    pet = { ...pet, configured: { name: live.petName, species: live.species } }
    pet = reduce(pet, { kind: 'tick' }, now, registry, live.settings).pet
    await update($, petAtom, () => pet)
    await $.store.set('pet', pet)
    await refreshPane($)
    // A load starts with the panel closed, even one left open before a reload.
    await closePane($)
    const isStripClosed = (await $.store.get('isStripClosed')) === true
    await update($, stripClosedAtom, () => isStripClosed)
    const isHidden = (await $.store.get('isHidden')) === true
    await update($, hiddenAtom, () => isHidden)
    await announce($, pet, [], now)

    animate($, !isHidden)
    $.clock.every(MINUTE, () => void dispatch($, { kind: 'tick' }).catch(() => undefined))

    return started
  })

  on('codingPet.get', async $ => {
    const pet = await read($, petAtom)
    if (pet === null) return { deny: 'coding-pet: no pet yet' }
    const now = await $.clock.now()
    return { value: viewOf(decay(pet, now, live.settings), now, await read($, busyAtom)) }
  })
  on('codingPet.award', async ($, e) => ({
    value: await dispatch($, { kind: 'activity', activity: e.kind, xp: e.xp ?? 5, ...(e.reason === undefined ? {} : { reason: e.reason }) }),
  }))
  on('codingPet.act', async ($, e) => ({ value: await dispatch($, e) }))
  on('codingPet.addSpecies', async ($, e) => {
    await update($, extensionsAtom, ext => addTo(ext, 'species', e))
    await refreshPane($)
    return { value: undefined }
  })
  on('codingPet.addFood', async ($, e) => {
    await update($, extensionsAtom, ext => addTo(ext, 'foods', e))
    await refreshPane($)
    return { value: undefined }
  })
  on('codingPet.addActivity', async ($, e) => {
    await update($, extensionsAtom, ext => addTo(ext, 'activities', e))
    await refreshPane($)
    return { value: undefined }
  })
  on('codingPet.addAchievement', async ($, e) => {
    await update($, extensionsAtom, ext => addTo(ext, 'achievements', e))
    await refreshPane($)
    return { value: undefined }
  })

  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) await update($, paneOpenAtom, () => false)
    return closed
  })

  on('command.run', { command: 'codepet' }, async ($, e) => ({ text: await run($, e.args) }))

  on('prompt.submit', async ($, e, next) => {
    await update($, busyAtom, () => true)
    await signal($, { on: 'prompt' }).catch(() => undefined)
    await refreshPane($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await update($, busyAtom, () => false)
    await signal($, { on: 'turn' }).catch(() => undefined)
    await refreshPane($)
    return done
  })

  on('tool.call', { tool: PET_STATUS }, async $ => {
    const pet = await read($, petAtom)
    if (pet === null) return { result: 'The pet has not hatched yet.' }
    const now = await $.clock.now()
    const fresh = decay(pet, now, live.settings)
    return { result: describe(fresh, await registryOf($), moodOf(fresh, now, true), now) }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    if ('deny' in ran && ran.deny !== undefined) return ran
    if (tool.startsWith(`mcp__${PLUGIN}__`)) return ran
    await signal($, { on: 'tool', tool, command: commandOf(e), isError: ran.isError === true }).catch(() => undefined)
    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    live.windowRows = e.viewport?.rows ?? e.props.maxRows * 2
    if (!live.showBand || e.props.hasSurvey || (await read($, hiddenAtom)) || (await read($, paneOpenAtom)) || (await read($, stripClosedAtom))) return next(e)
    const pet = await read($, petAtom)
    if (pet === null) return next(e)
    const frame = await read($, frameAtom)
    const isBusy = e.props.isWorking || (await read($, busyAtom))
    const registry = await registryOf($)
    const now = await $.clock.now()
    const mood = moodOf(pet, now, isBusy)
    const species = speciesOf(registry, pet.species)
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const bubble = bubbleOf(mood, frame)
    const s = pet.stats
    const buttons = (
      <Box flexDirection={width >= 60 ? 'column' : 'row'} marginLeft={1}>
        <Button key="feed" label="feed" hotkey="f" dimColor onPress={() => care($, { kind: 'feed' })} />
        <Button key="play" label="play" hotkey="p" dimColor onPress={() => care($, { kind: 'play' })} />
        <Button key="rest" label={mood === 'sleeping' ? 'wake' : 'rest'} hotkey="r" dimColor onPress={() => care($, { kind: 'rest' })} />
        <Button key="panel" label="panel" hotkey="o" dimColor onPress={() => openPane($)} />
      </Box>
    )

    if (width < 60) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text wrap="truncate">
              <Text color={species.color}>{iconOf(pet, species)} {pet.name}</Text>
              <Text dimColor> Lv{pet.level} </Text>
              <Text color={statColor(s.happiness)}>♥{Math.round(s.happiness)} </Text>
              <Text color={statColor(s.energy)}>⚡{Math.round(s.energy)} </Text>
              <Text color={statColor(s.fullness)}>🍖{Math.round(s.fullness)} </Text>
              <Text color="#F28CB1">{bubble}</Text>
            </Text>
            {buttons}
          </Box>
          {below}
        </Box>
      )
    }

    const sprite = spriteRows(pet, species, mood, frame)
    const mini = width >= 90 ? 8 : 5
    const xpBar = Math.max(8, Math.min(30, width - 50))
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Box flexDirection="column">
            {sprite.map(row => (
              <Text color={species.color}>{row}</Text>
            ))}
          </Box>
          <Box flexDirection="column" marginLeft={2} flexGrow={1}>
            <Text wrap="truncate">
              <Text bold>{pet.name}</Text>
              <Text dimColor> · Lv {pet.level} {stageOf(pet.level)} · {MOOD_LABEL[mood]} </Text>
              <Text color="#F28CB1">{bubble}</Text>
            </Text>
            <Text wrap="truncate">
              <Text dimColor>XP </Text>
              <Text color="#9B87F5">{bar(pet.xp, xpToNext(pet.level), xpBar)}</Text>
              <Text dimColor> {Math.floor(pet.xp)}/{xpToNext(pet.level)}</Text>
            </Text>
            <Text wrap="truncate">
              <Text>♥ </Text>
              <Text color={statColor(s.happiness)}>{bar(s.happiness, 100, mini)}</Text>
              <Text>  ⚡ </Text>
              <Text color={statColor(s.energy)}>{bar(s.energy, 100, mini)}</Text>
              <Text>  🍖 </Text>
              <Text color={statColor(s.fullness)}>{bar(s.fullness, 100, mini)}</Text>
            </Text>
          </Box>
          {buttons}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // The view alone: the pet itself changes on every tool call, the view only
    // when what it shows does (see refreshPane).
    const view = await read($, paneViewAtom)
    if (view === null) return <Text dimColor>Your pet has not hatched yet.</Text>
    // A surface that draws SVG gets the animated picture, which moves by itself;
    // only the terminal's text sprite follows the frame counter.
    const isPicture = e.surface !== 'terminal' && 'Svg' in ui
    const frame = isPicture ? 0 : await read($, frameAtom)
    const species = speciesOf(await registryOf($), view.species)
    const { mood } = view
    const width = Math.max(30, e.props.bodyColumns)
    // Beside the picture (about 28 cells) or the sprite there is less room.
    const long = Math.max(8, Math.min(24, width - (isPicture ? 50 : 36)))
    const s = view.stats
    const earned = view.achievements.filter(one => one.isEarned).length
    const stat = (label: string, value: number) => (
      <Text wrap="truncate">
        <Text>{label.padEnd(10)}</Text>
        <Text color={statColor(value)}>{bar(value, 100, long)}</Text>
        <Text dimColor> {value}</Text>
      </Text>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {isPicture && 'Svg' in ui ? (
            // The picture moves by itself and changes only with the mood, stage or
            // species, so XP and stats never reload it; they are text beside it.
            <ui.Svg
              key="pet-scene"
              source={petScene(species, view.stage, mood)}
              alt={`${view.name} the ${species.id}, ${MOOD_LABEL[mood]}`}
              width={SCENE.width}
              height={SCENE.height}
              isInteractive
            />
          ) : (
            <Box flexDirection="column">
              {spriteRows(view, species, mood, frame).map(row => (
                <Text color={species.color}>{row}</Text>
              ))}
            </Box>
          )}
          <Box flexDirection="column" marginLeft={2} flexGrow={1}>
            <Text bold>{view.name}</Text>
            <Text dimColor>
              {species.id} · {view.stage} · {MOOD_LABEL[mood]}
            </Text>
            {!isPicture && <Text color="#F28CB1">{bubbleOf(mood, frame) || ' '}</Text>}
            <Text> </Text>
            <Text wrap="truncate">
              <Text>{`Level ${view.level}`.padEnd(10)}</Text>
              <Text color="#9B87F5">{bar(view.xp, view.xpToNext, long)}</Text>
              <Text dimColor> {view.xp}/{view.xpToNext}</Text>
            </Text>
            {stat('Happiness', s.happiness)}
            {stat('Energy', s.energy)}
            {stat('Fullness', s.fullness)}
          </Box>
        </Box>
        <Text> </Text>
        <Text bold>Today</Text>
        {view.today.length === 0 && <Text dimColor>No XP yet today.</Text>}
        {view.today.map(one => (
          <Text wrap="truncate">
            {one.label.padEnd(16)}
            <Text color="#6CC24A">+{one.xp} XP</Text>
          </Text>
        ))}
        <Text> </Text>
        <Text bold>Lifetime · {view.totalXp} XP</Text>
        {view.totals.length === 0 && <Text dimColor>Nothing yet.</Text>}
        {view.totals.map(one => (
          <Text wrap="truncate" dimColor>
            {one.label.padEnd(16)}
            {one.count}
          </Text>
        ))}
        <Text> </Text>
        <Text bold>
          Achievements {earned}/{view.achievements.length}
        </Text>
        {view.achievements.map(one =>
          one.isEarned ? (
            <Text wrap="truncate">
              {one.emoji} {one.title}
              <Text dimColor> · {one.description}</Text>
            </Text>
          ) : (
            <Text wrap="truncate" dimColor>
              · {one.title} · {one.description}
            </Text>
          ),
        )}
        <Text> </Text>
        <Box flexDirection="row" flexWrap="wrap">
          {view.foods.map((food, i) => (
            <Button
              key={`food:${food.id}`}
              label={`${food.emoji} ${food.id}`}
              hotkey={i < 9 ? String(i + 1) : undefined}
              onPress={() => care($, { kind: 'feed', food: food.id })}
            />
          ))}
          <Button key="play" label="play" hotkey="p" onPress={() => care($, { kind: 'play' })} />
          <Button key="rest" label={mood === 'sleeping' ? 'wake' : 'rest'} hotkey="r" onPress={() => care($, { kind: 'rest' })} />
          <Button key="close" label="close" hotkey="x" role="dismiss" dimColor onPress={() => closePane($)} />
        </Box>
      </Box>
    )
  })
}
