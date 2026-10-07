import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Player } from '../types'
import {
  ACTIONS,
  PAST,
  actionOf,
  appName,
  describe,
  describeVolume,
  isPlaying,
  parseLine,
  splitLines,
  trackLine,
  volumeCommand,
  volumeOf,
  volumePast,
} from './dj'
import type { Action, VolumeChange } from './dj'
import { HEARTBEAT_MS, WINDOWS_WATCHER, slashes, windowsWatcherArgv } from './host'

const PLUGIN = 'claude-dj'
const NOW_PLAYING = `mcp__${PLUGIN}__now_playing`
const CONTROL = `mcp__${PLUGIN}__music_control`
const VOLUME = `mcp__${PLUGIN}__music_volume`
const VOLUME_HINT = '[0-100 | +10 | -10 | up | down | mute | unmute]'
const RESTARTS = 3

const playerAtom = atom({ plugin: 'claude-dj', key: 'player' } as const, { kind: 'starting' })

/** The slash commands; `/dj` and `/vol` take theirs as the argument. */
const COMMANDS: { name: string; action?: Action; isVolume?: true; description: string }[] = [
  { name: 'dj', description: 'Control the music: /dj [play | pause | next | prev | vol …], no argument toggles' },
  { name: 'play', action: 'play', description: 'Play the music' },
  { name: 'pause', action: 'pause', description: 'Pause the music' },
  { name: 'next', action: 'next', description: 'Skip to the next track' },
  { name: 'prev', action: 'previous', description: 'Go back to the previous track' },
  { name: 'vol', isVolume: true, description: `Set the volume: /vol ${VOLUME_HINT}` },
]

/** What this load of the module holds; a reload starts it over (and a new watcher). */
const live: {
  showBand: boolean
  /** How far up and down move the volume, in percent. */
  step: number
  /** The watcher's work folder, fresh per start, so no watcher reads another's commands. */
  workDir: string | undefined
  sent: number
  /** Wakes those waiting for the watcher's next state. */
  waiters: ((player: Player) => void)[]
} = { showBand: true, step: 10, workDir: undefined, sent: 0, waiters: [] }

async function setPlayer($: EngineInterface, player: Player): Promise<void> {
  await update($, playerAtom, () => player)
  if (!live.showBand) {
    const track = player.kind === 'ready' ? player.track : null
    $.ui.status(track !== null && isPlaying(track) ? `♪ ${trackLine(track, 40)}` : undefined)
  }
}

async function onLine($: EngineInterface, line: string): Promise<void> {
  const said = parseLine(line)
  if (said === undefined) return
  if ('error' in said) {
    $.ui.log(`${PLUGIN}: ${said.error}`, { to: 'debug' })
    return
  }
  const player: Player = { kind: 'ready', track: said.track, volume: said.volume }
  await setPlayer($, player)
  const woken = live.waiters
  live.waiters = []
  for (const wake of woken) wake(player)
}

/** Reads the watcher's lines for as long as it runs; restarts it when it fails. */
async function follow($: EngineInterface, dir: string, script: string, attempt: number): Promise<void> {
  let buffer = ''
  let errors = ''
  try {
    for await (const { stream, text } of $.process.spawn({ argv: windowsWatcherArgv(script, dir) })) {
      if (stream === 'stderr') {
        errors = `${errors}${text}`.slice(-400)
        continue
      }
      const { lines, rest } = splitLines(`${buffer}${text}`)
      buffer = rest
      for (const one of lines) await onLine($, one)
    }
  } catch (error) {
    errors = String(error)
  }
  // The watcher ended: a reload killed it (and this module with it), or it failed.
  try {
    if (live.workDir !== dir) return
    live.workDir = undefined
    const reason = errors.trim() === '' ? 'the media watcher stopped' : (errors.trim().split(/\r?\n/)[0] ?? '')
    $.ui.log(`${PLUGIN}: watcher ended: ${errors.trim()}`, { to: 'debug' })
    if (attempt < RESTARTS) {
      $.clock.after(5_000 * (attempt + 1), () => void startWatcher($, attempt + 1).catch(() => undefined))
    } else {
      await setPlayer($, { kind: 'unavailable', reason })
    }
  } catch {
    // The module is gone; nothing to tell.
  }
}

async function startWatcher($: EngineInterface, attempt: number): Promise<void> {
  const temp = slashes((await $.env.get('TEMP')) ?? (await $.env.get('TMP')) ?? '.').replace(/\/$/, '')
  const dir = `${temp}/${PLUGIN}/${(await $.clock.now()).toString(36)}`
  const script = `${dir}/watch.ps1`
  await $.fs.write(script, WINDOWS_WATCHER)
  await $.fs.write(`${dir}/heartbeat`, 'alive')
  live.workDir = dir
  void follow($, dir, script, attempt)
}

/** Hands the watcher one command line; false when there is no watcher to take it. */
async function send($: EngineInterface, command: string): Promise<boolean> {
  const dir = live.workDir
  if (dir === undefined) return false
  live.sent += 1
  const name = `${(await $.clock.now()).toString().padStart(15, '0')}-${String(live.sent).padStart(4, '0')}`
  await $.fs.write(`${dir}/commands/${name}.cmd`, command)

  return true
}

/**
 * Sends a command line and waits, briefly, for the state it leads to; says
 * what was done, then the track, or the volume after a volume change.
 */
async function control($: EngineInterface, command: string, done: string, isVolume: boolean): Promise<string> {
  const player = await read($, playerAtom)
  if (player.kind === 'unavailable') return `Music control is unavailable: ${player.reason}`
  const changed = new Promise<Player>(resolve => live.waiters.push(resolve))
  if (!(await send($, command))) return 'The music watcher is still starting; try again in a moment.'
  // A play that was already playing changes nothing: then what was, is.
  const now = await Promise.race([changed, $.clock.sleep(1_500).then(() => player)])
  if (now.kind !== 'ready') return `${done}.`

  return `${done}. ${isVolume ? describeVolume(now.volume) : describe(now.track)}`
}

async function transport($: EngineInterface, action: Action): Promise<string> {
  return control($, action, PAST[action], false)
}

async function volume($: EngineInterface, change: VolumeChange | 'show'): Promise<string> {
  if (change !== 'show') return control($, volumeCommand(change), volumePast(change), true)
  const player = await read($, playerAtom)
  if (player.kind === 'unavailable') return `Music control is unavailable: ${player.reason}`

  return player.kind === 'ready' ? describeVolume(player.volume) : 'The music watcher is still starting.'
}

/** `/dj vol 40`, `/dj mute`: the volume part of `/dj`, or undefined for anything else. */
function djVolume(args: string): VolumeChange | 'show' | undefined {
  const [first = '', ...rest] = args.trim().split(/\s+/)
  const word = first.toLowerCase()
  if (word === 'vol' || word === 'volume') return volumeOf(rest.join(' '), live.step)
  if (word === 'mute' || word === 'unmute') return volumeOf(word, live.step)

  return undefined
}

async function heartbeat($: EngineInterface): Promise<void> {
  if (live.workDir !== undefined) await $.fs.write(`${live.workDir}/heartbeat`, 'alive')
}

export const register: Register = (on, options) => {
  live.showBand = options.showBand !== false
  live.step = typeof options.volumeStep === 'number' && options.volumeStep > 0 ? Math.min(50, options.volumeStep) : 10
  const musicTools = options.musicTools !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    for (const command of COMMANDS) {
      await $.command.register({
        name: command.name,
        description: command.description,
        argumentHint:
          command.isVolume === true
            ? VOLUME_HINT
            : command.action === undefined
              ? '[play | pause | next | prev | vol …]'
              : undefined,
        immediate: true,
      })
    }
    if (musicTools) {
      await $.tool.register({
        name: 'now_playing',
        description:
          'Says what music or media is playing on this computer right now (YouTube Music, Spotify, a browser tab, ...): title, artist, album, app, whether it plays or is paused, and the volume.',
        inputSchema: { type: 'object', properties: {} },
      })
      await $.tool.register({
        name: 'music_control',
        description:
          'Controls the music or media playing on this computer: play, pause, toggle, next or previous track. Use it when the user asks you to change their music. Answers with what plays afterwards.',
        inputSchema: {
          type: 'object',
          properties: { action: { type: 'string', enum: [...ACTIONS] } },
          required: ['action'],
        },
      })
      await $.tool.register({
        name: 'music_volume',
        description:
          "Changes this computer's output volume (the one the volume keys change): set a level, change it by an amount, or mute and unmute. Use it when the user asks for the music louder, quieter or muted. Answers with the volume afterwards.",
        inputSchema: {
          type: 'object',
          properties: {
            level: { type: 'integer', minimum: 0, maximum: 100, description: 'Set the volume to this percentage.' },
            change: { type: 'integer', minimum: -100, maximum: 100, description: 'Change the volume by this many percent.' },
            mute: { type: 'boolean', description: 'true mutes, false unmutes.' },
          },
        },
      })
    }

    if ((await $.env.get('OS')) !== 'Windows_NT') {
      await setPlayer($, {
        kind: 'unavailable',
        reason: 'this version drives Windows media sessions only; macOS and Linux support is coming.',
      })
      return started
    }
    await setPlayer($, { kind: 'starting' })
    await startWatcher($, 0)
    $.clock.every(HEARTBEAT_MS, () => void heartbeat($).catch(() => undefined))

    return started
  })

  for (const command of COMMANDS) {
    on('command.run', { command: command.name }, async ($, e) => {
      if (command.isVolume === true) {
        const change = volumeOf(e.args, live.step)
        if (change === undefined) return { text: `Unknown volume "${e.args.trim()}". Try /vol ${VOLUME_HINT}.` }

        return { text: await volume($, change) }
      }
      const change = command.action === undefined ? djVolume(e.args) : undefined
      if (change !== undefined) return { text: await volume($, change) }
      const action = command.action ?? actionOf(e.args)
      if (action === undefined) return { text: `Unknown action "${e.args.trim()}". Try /dj play, pause, next, prev or vol.` }

      return { text: await transport($, action) }
    })
  }

  on('tool.call', { tool: NOW_PLAYING }, async $ => {
    const player = await read($, playerAtom)
    if (player.kind === 'unavailable') return { result: `Music control is unavailable: ${player.reason}` }
    if (player.kind === 'starting') return { result: 'The music watcher is still starting; ask again in a moment.' }

    return { result: `${describe(player.track)} ${describeVolume(player.volume)}` }
  })

  on('tool.call', { tool: CONTROL }, async ($, e) => {
    const input = e as unknown as { action?: unknown }
    const action = ACTIONS.find(one => one === input.action)
    if (action === undefined) return { result: `Unknown action; use one of: ${ACTIONS.join(', ')}.` }

    return { result: await transport($, action) }
  })

  on('tool.call', { tool: VOLUME }, async ($, e) => {
    const input = e as unknown as { level?: unknown; change?: unknown; mute?: unknown }
    let change: VolumeChange | undefined
    if (typeof input.level === 'number') change = { kind: 'set', level: input.level }
    else if (typeof input.change === 'number') change = { kind: 'step', by: input.change }
    else if (typeof input.mute === 'boolean') change = { kind: input.mute ? 'mute' : 'unmute' }
    if (change === undefined) return { result: 'Give one of: level (0-100), change (-100 to 100) or mute (true/false).' }

    return { result: await volume($, change) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!live.showBand || e.props.hasSurvey) return next(e)
    const player = await read($, playerAtom)
    if (player.kind !== 'ready' || player.track === null) return next(e)
    const track = player.track
    const playing = isPlaying(track)
    const sound = player.volume
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor={!playing}>{`${playing ? '♪' : '⏸'} ${trackLine(track, 60)}`}</Text>
        <Text dimColor>{`· ${appName(track.app)}`}</Text>
        <Button key="prev" label="⏮" onPress={() => void send($, 'previous')} />
        <Button key="toggle" label={playing ? '⏸' : '▶'} onPress={() => void send($, 'toggle')} />
        <Button key="next" label="⏭" onPress={() => void send($, 'next')} />
        {sound !== null && (
          <Box flexDirection="row" gap={1}>
            <Button key="mute" label={sound.muted ? '🔇' : '🔊'} onPress={() => void send($, 'togglemute')} />
            <Button key="voldown" label="−" onPress={() => void send($, `volume -${live.step}`)} />
            <Text dimColor={sound.muted}>
              {sound.muted ? 'muted' : `${sound.level}%`}
            </Text>
            <Button key="volup" label="+" onPress={() => void send($, `volume +${live.step}`)} />
          </Box>
        )}
      </Box>
    )
  })
}
