import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Player, SpotifyStatus } from '../types'
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
import {
  ACCOUNTS,
  API,
  CALLBACK_LISTENER,
  KINDS,
  REDIRECT_URI,
  asAccount,
  authorizeUrl,
  codeExchangeBody,
  currentItem,
  errorText,
  isNoActiveDevice,
  itemLine,
  kindOfUri,
  listenerArgv,
  openArgv,
  parseAccount,
  parseCallback,
  parseDevices,
  parseTokens,
  pickDevice,
  pkce,
  randomText,
  refreshBody,
  searchItems,
  spotifyCommandOf,
  spotifyUri,
} from './spotify'
import type { Device, Item, Kind } from './spotify'

const PLUGIN = 'claude-dj'
const NOW_PLAYING = `mcp__${PLUGIN}__now_playing`
const CONTROL = `mcp__${PLUGIN}__music_control`
const VOLUME = `mcp__${PLUGIN}__music_volume`
const SPOTIFY_SEARCH = `mcp__${PLUGIN}__spotify_search`
const SPOTIFY_PLAY = `mcp__${PLUGIN}__spotify_play`
const SPOTIFY_QUEUE = `mcp__${PLUGIN}__spotify_queue`
const SPOTIFY_LIKE = `mcp__${PLUGIN}__spotify_like`
const VOLUME_HINT = '[0-100 | +10 | -10 | up | down | mute | unmute]'
const SPOTIFY_HINT = '[song | album … | playlist … | queue … | like | devices | login | logout]'
const RESTARTS = 3
/** Where `$.store` keeps the Spotify sign-in (tokens, account name and plan). */
const SPOTIFY_STORE = 'spotify'
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const SETUP = [
  'Spotify is not set up yet. Once, with a Spotify Premium account:',
  '1. Create an app at https://developer.spotify.com/dashboard (pick Web API).',
  `2. Add this Redirect URI to it: ${REDIRECT_URI}`,
  "3. Put the app's Client ID in claude-dj's spotifyClientId setting.",
  '4. Run /spotify login.',
].join('\n')

const playerAtom = atom({ plugin: 'claude-dj', key: 'player' } as const, { kind: 'starting' })
const spotifyAtom = atom({ plugin: 'claude-dj', key: 'spotify' } as const, null)
const hiddenAtom = atom({ plugin: 'claude-dj', key: 'isHidden' } as const, false)
/** Where `$.store` remembers that the band was hidden, so it stays hidden in the next session. */
const HIDDEN_STORE = 'bandHidden'
const DJ_HINT = '[play | pause | next | prev | vol … | hide | show]'

/** The slash commands; `/dj` and `/vol` take theirs as the argument. */
const COMMANDS: { name: string; action?: Action; isVolume?: true; description: string }[] = [
  { name: 'dj', description: 'Control the music: /dj [play | pause | next | prev | vol … | hide | show], no argument toggles' },
  { name: 'play', action: 'play', description: 'Play the music; /play <song> finds and plays it on Spotify' },
  { name: 'pause', action: 'pause', description: 'Pause the music' },
  { name: 'next', action: 'next', description: 'Skip to the next track' },
  { name: 'prev', action: 'previous', description: 'Go back to the previous track' },
  { name: 'vol', isVolume: true, description: `Set the volume: /vol ${VOLUME_HINT}` },
]

type SpotifyAnswer = { status: number; text: string } | { error: string }

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
  /** The Spotify app's Client ID from the settings; empty when Spotify is not set up. */
  clientId: string
} = { showBand: true, step: 10, workDir: undefined, sent: 0, waiters: [], clientId: '' }

/** Without the band (turned off, or hidden), a status line entry says what plays. */
async function refreshStatus($: EngineInterface, player: Player): Promise<void> {
  const isBandOff = !live.showBand || (await read($, hiddenAtom))
  const track = player.kind === 'ready' ? player.track : null
  $.ui.status(isBandOff && track !== null && isPlaying(track) ? `♪ ${trackLine(track, 40)}` : undefined)
}

async function setPlayer($: EngineInterface, player: Player): Promise<void> {
  await update($, playerAtom, () => player)
  await refreshStatus($, player)
}

async function setHidden($: EngineInterface, isHidden: boolean): Promise<string> {
  await update($, hiddenAtom, () => isHidden)
  await $.store.set(HIDDEN_STORE, isHidden)
  await refreshStatus($, await read($, playerAtom))
  if (!live.showBand) return 'The band is turned off in the settings (showBand); turn that on to see it.'

  return isHidden ? 'Band hidden. /dj show brings it back.' : 'Band shown.'
}

async function hideFromBand($: EngineInterface): Promise<void> {
  $.ui.toast(await setHidden($, true))
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

// Spotify Web API: search, play, queue and like, signed in with PKCE.

async function setSpotify($: EngineInterface, status: SpotifyStatus | null): Promise<void> {
  await update($, spotifyAtom, () => status)
}

/** A fresh access token, refreshed when it is about to expire; undefined when not signed in. */
async function accessToken($: EngineInterface): Promise<string | undefined> {
  const account = asAccount(await $.store.get(SPOTIFY_STORE))
  if (account === undefined) return undefined
  const now = await $.clock.now()
  if (account.expiresAt - 60_000 > now) return account.accessToken
  const answer = await $.http.fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: FORM,
    body: refreshBody(live.clientId, account.refreshToken),
  })
  const tokens = parseTokens(answer.text, now, account.refreshToken)
  if ('error' in tokens) {
    // Revoked or from another app: the sign-in is no good any more.
    if (answer.status === 400) {
      await $.store.delete(SPOTIFY_STORE)
      await setSpotify($, null)
    }
    return undefined
  }
  await $.store.set(SPOTIFY_STORE, { ...account, ...tokens })

  return tokens.accessToken
}

/** One Web API call as the signed-in account; `{ error }` when there is no account to call as. */
async function spotify($: EngineInterface, method: string, path: string, body?: unknown): Promise<SpotifyAnswer> {
  if (live.clientId === '') return { error: SETUP }
  const access = await accessToken($)
  if (access === undefined) return { error: 'Not connected to Spotify: run /spotify login.' }
  const headers: Record<string, string> = { authorization: `Bearer ${access}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const answer = await $.http.fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? (method === 'GET' ? undefined : '') : JSON.stringify(body),
  })

  return { status: answer.status, text: answer.text }
}

async function spotifyLogin($: EngineInterface): Promise<string> {
  if (live.clientId === '') return SETUP
  if ((await $.env.get('OS')) !== 'Windows_NT') return 'Spotify sign-in needs Windows in this version of claude-dj.'
  const { verifier, challenge } = await pkce()
  const state = randomText(16)
  const temp = slashes((await $.env.get('TEMP')) ?? (await $.env.get('TMP')) ?? '.').replace(/\/$/, '')
  const script = `${temp}/${PLUGIN}/login/listen.ps1`
  await $.fs.write(script, CALLBACK_LISTENER)
  const url = authorizeUrl(live.clientId, challenge, state)
  void finishLogin($, script, state, verifier)
  await $.process.run(openArgv(url), { timeoutMs: 10_000 }).catch(() => undefined)

  return `Opened the Spotify sign-in in your browser. If it did not open, go to:\n${url}`
}

/** Waits for Spotify's redirect, trades the code for tokens and says who signed in. */
async function finishLogin($: EngineInterface, script: string, state: string, verifier: string): Promise<void> {
  let buffer = ''
  let said: { code: string } | { error: string } | undefined
  try {
    for await (const { stream, text } of $.process.spawn({ argv: listenerArgv(script, state) })) {
      if (stream !== 'stdout') continue
      const { lines, rest } = splitLines(`${buffer}${text}`)
      buffer = rest
      for (const one of lines) said ??= parseCallback(one)
    }
  } catch (error) {
    said ??= { error: String(error) }
  }
  said ??= parseCallback(buffer) ?? { error: 'the sign-in stopped without an answer' }
  try {
    if ('error' in said) {
      $.ui.toast(`Spotify sign-in failed: ${said.error}`)
      return
    }
    const now = await $.clock.now()
    const answer = await $.http.fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: FORM,
      body: codeExchangeBody(live.clientId, said.code, verifier),
    })
    const tokens = parseTokens(answer.text, now)
    if ('error' in tokens) {
      $.ui.toast(`Spotify sign-in failed: ${tokens.error}`)
      return
    }
    const me = await $.http.fetch(`${API}/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })
    const who = parseAccount(me.text)
    await $.store.set(SPOTIFY_STORE, { ...tokens, ...who })
    await setSpotify($, who)
    $.ui.toast(
      who.product === 'premium'
        ? `Connected to Spotify as ${who.name}`
        : `Connected to Spotify as ${who.name}; playing and queueing need Premium, search works`,
    )
  } catch {
    // The module reloaded mid sign-in; run /spotify login again.
  }
}

async function spotifyLogout($: EngineInterface): Promise<string> {
  await $.store.delete(SPOTIFY_STORE)
  await setSpotify($, null)

  return 'Signed out of Spotify. (To revoke access fully, remove the app at https://www.spotify.com/account/apps/)'
}

async function spotifySearch($: EngineInterface, kind: Kind, query: string): Promise<Item[] | { error: string }> {
  const answer = await spotify($, 'GET', `/search?${new URLSearchParams({ q: query, type: kind, limit: '5' }).toString()}`)
  if ('error' in answer) return answer
  if (answer.status >= 300) return { error: errorText(answer.status, answer.text) }

  return searchItems(answer.text, kind)
}

/** A URI as given, or the best search match: its URI and how to name it. */
async function findTarget($: EngineInterface, kind: Kind, query: string): Promise<{ uri: string; label: string } | { error: string }> {
  const uri = spotifyUri(query)
  if (uri !== undefined) return { uri, label: uri }
  if (query.trim() === '') return { error: 'Say what to look for, e.g. /spotify daft punk one more time.' }
  const found = await spotifySearch($, kind, query)
  if ('error' in found) return found
  const best = found[0]

  return best === undefined ? { error: `Nothing on Spotify matches "${query}".` } : { uri: best.uri, label: itemLine(best) }
}

/** A device to play on; starts the Spotify app here when Spotify runs nowhere. */
async function wakeDevice($: EngineInterface): Promise<Device | string> {
  for (let tries = 0; tries < 6; tries++) {
    const answer = await spotify($, 'GET', '/me/player/devices')
    if ('error' in answer) return answer.error
    const device = pickDevice(parseDevices(answer.text))
    if (device !== undefined) return device
    if (tries === 0) await $.process.run(openArgv('spotify:'), { timeoutMs: 10_000 }).catch(() => undefined)
    await $.clock.sleep(1_000)
  }

  return 'Spotify is not open on any device. I tried to start the Spotify app here: open it and try again.'
}

/** Sends a play request, waking a device when none is active; undefined when it played. */
async function playOn($: EngineInterface, body: unknown): Promise<string | undefined> {
  let answer = await spotify($, 'PUT', '/me/player/play', body)
  if ('error' in answer) return answer.error
  if (isNoActiveDevice(answer.status, answer.text)) {
    const device = await wakeDevice($)
    if (typeof device === 'string') return device
    answer = await spotify($, 'PUT', `/me/player/play?device_id=${encodeURIComponent(device.id)}`, body)
    if ('error' in answer) return answer.error
  }

  return answer.status < 300 ? undefined : errorText(answer.status, answer.text)
}

async function spotifyPlay($: EngineInterface, kind: Kind, query: string): Promise<string> {
  const target = await findTarget($, kind, query)
  if ('error' in target) return target.error
  const kindOf = kindOfUri(target.uri)
  const body = kindOf === 'track' || kindOf === 'episode' ? { uris: [target.uri] } : { context_uri: target.uri }
  const failed = await playOn($, body)

  return failed ?? `Playing ${target.label} on Spotify.`
}

async function spotifyQueue($: EngineInterface, query: string): Promise<string> {
  const target = await findTarget($, 'track', query)
  if ('error' in target) return target.error
  const answer = await spotify($, 'POST', `/me/player/queue?uri=${encodeURIComponent(target.uri)}`)
  if ('error' in answer) return answer.error
  if (isNoActiveDevice(answer.status, answer.text)) return 'Spotify is not playing anywhere; play something first, then queue.'

  return answer.status < 300 ? `Queued ${target.label}.` : errorText(answer.status, answer.text)
}

async function spotifyLike($: EngineInterface): Promise<string> {
  const now = await spotify($, 'GET', '/me/player/currently-playing')
  if ('error' in now) return now.error
  const item = now.status === 200 ? currentItem(now.text) : undefined
  if (item === undefined) return 'Nothing is playing on Spotify to like.'
  const saved = await spotify($, 'PUT', `/me/library?uris=${encodeURIComponent(item.uri)}`)
  if ('error' in saved) return saved.error

  return saved.status < 300 ? `Liked "${item.name}": it is in your Liked Songs.` : errorText(saved.status, saved.text)
}

async function spotifyDevices($: EngineInterface): Promise<string> {
  const answer = await spotify($, 'GET', '/me/player/devices')
  if ('error' in answer) return answer.error
  if (answer.status >= 300) return errorText(answer.status, answer.text)
  const devices = parseDevices(answer.text)
  if (devices.length === 0) return 'Spotify is not open on any device.'

  return [
    'Spotify devices (switch with /spotify device <name>):',
    ...devices.map(one => `${one.isActive ? '▶' : '·'} ${one.name} (${one.type})`),
  ].join('\n')
}

async function spotifyDevice($: EngineInterface, name: string): Promise<string> {
  const answer = await spotify($, 'GET', '/me/player/devices')
  if ('error' in answer) return answer.error
  const wanted = name.trim().toLowerCase()
  const device = parseDevices(answer.text).find(one => one.name.toLowerCase().includes(wanted))
  if (wanted === '' || device === undefined) return `No Spotify device matches "${name.trim()}"; see /spotify devices.`
  const moved = await spotify($, 'PUT', '/me/player', { device_ids: [device.id], play: true })
  if ('error' in moved) return moved.error

  return moved.status < 300 ? `Playing on ${device.name}.` : errorText(moved.status, moved.text)
}

async function spotifyStatus($: EngineInterface): Promise<string> {
  if (live.clientId === '') return SETUP
  const account = asAccount(await $.store.get(SPOTIFY_STORE))
  if (account === undefined) return 'Spotify is set up but not signed in: run /spotify login.'
  const plan = account.product === 'premium' ? 'Premium' : `${account.product || 'unknown'} plan: playing and queueing need Premium`

  return `Connected to Spotify as ${account.name} (${plan}). Try /spotify <song>, /spotify playlist <name>, /spotify queue <song>, /spotify like.`
}

async function spotifyCommand($: EngineInterface, args: string): Promise<string> {
  const command = spotifyCommandOf(args)
  switch (command.verb) {
    case 'status':
      return spotifyStatus($)
    case 'login':
      return spotifyLogin($)
    case 'logout':
      return spotifyLogout($)
    case 'like':
      return spotifyLike($)
    case 'devices':
      return spotifyDevices($)
    case 'device':
      return spotifyDevice($, command.name)
    case 'queue':
      return spotifyQueue($, command.query)
    case 'play':
      return spotifyPlay($, command.kind, command.query)
  }
}

async function likeFromBand($: EngineInterface): Promise<void> {
  $.ui.toast(await spotifyLike($))
}

async function heartbeat($: EngineInterface): Promise<void> {
  if (live.workDir !== undefined) await $.fs.write(`${live.workDir}/heartbeat`, 'alive')
}

export const register: Register = (on, options) => {
  live.showBand = options.showBand !== false
  live.step = typeof options.volumeStep === 'number' && options.volumeStep > 0 ? Math.min(50, options.volumeStep) : 10
  live.clientId = String(options.spotifyClientId ?? '').trim()
  const musicTools = options.musicTools !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'spotify',
      description: 'Spotify: play a song, album or playlist, queue, like, switch device, sign in',
      argumentHint: SPOTIFY_HINT,
      immediate: true,
    })
    const account = live.clientId === '' ? undefined : asAccount(await $.store.get(SPOTIFY_STORE))
    await setSpotify($, account === undefined ? null : { name: account.name, product: account.product })
    await update($, hiddenAtom, () => false)
    if ((await $.store.get(HIDDEN_STORE)) === true) await update($, hiddenAtom, () => true)
    for (const command of COMMANDS) {
      await $.command.register({
        name: command.name,
        description: command.description,
        argumentHint: command.isVolume === true ? VOLUME_HINT : command.action === undefined ? DJ_HINT : undefined,
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
    if (musicTools && live.clientId !== '') {
      const kind = { type: 'string', enum: [...KINDS], description: 'What to look for; track when left out.' }
      await $.tool.register({
        name: 'spotify_search',
        description:
          "Searches Spotify for tracks, albums, artists or playlists and lists the top 5 with their Spotify URIs. Use it to pick what to play or queue for the user.",
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search words, e.g. "lofi beats" or "daft punk".' }, type: kind },
          required: ['query'],
        },
      })
      await $.tool.register({
        name: 'spotify_play',
        description:
          'Plays something on the user\'s Spotify right away: the best match for a search, or an exact Spotify URI or open.spotify.com link. Albums, artists and playlists play as a whole. Use it when the user asks you to put something on.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search words, a spotify: URI or an open.spotify.com link.' }, type: kind },
          required: ['query'],
        },
      })
      await $.tool.register({
        name: 'spotify_queue',
        description: "Adds a track to the user's Spotify queue: the best match for a search, or an exact Spotify track URI or link.",
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search words, a spotify:track: URI or a track link.' } },
          required: ['query'],
        },
      })
      await $.tool.register({
        name: 'spotify_like',
        description: "Saves the track playing on Spotify now to the user's Liked Songs.",
        inputSchema: { type: 'object', properties: {} },
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
      const words = e.args.trim()
      if (command.action === undefined && /^(hide|show)$/i.test(words)) {
        return { text: await setHidden($, words.toLowerCase() === 'hide') }
      }
      const change = command.action === undefined ? djVolume(e.args) : undefined
      if (change !== undefined) return { text: await volume($, change) }
      // `/play some song` and `/dj play some song` search Spotify; bare `/play` resumes.
      const song = command.action === 'play' ? words : /^play\s+/i.test(words) ? words.replace(/^play\s+/i, '') : ''
      if (song !== '') return { text: await spotifyPlay($, 'track', song) }
      const action = command.action ?? actionOf(e.args)
      if (action === undefined) return { text: `Unknown action "${e.args.trim()}". Try /dj ${DJ_HINT}.` }

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

  on('command.run', { command: 'spotify' }, async ($, e) => ({ text: await spotifyCommand($, e.args) }))

  /** The `type` a Spotify tool was given, or track. */
  const kindIn = (input: { type?: unknown }): Kind => KINDS.find(one => one === input.type) ?? 'track'

  on('tool.call', { tool: SPOTIFY_SEARCH }, async ($, e) => {
    const input = e as unknown as { query?: unknown; type?: unknown }
    const kind = kindIn(input)
    const query = typeof input.query === 'string' ? input.query : ''
    const found = await spotifySearch($, kind, query)
    if ('error' in found) return { result: found.error }
    if (found.length === 0) return { result: `Nothing on Spotify matches "${query}".` }

    return { result: found.map((item, index) => `${index + 1}. ${itemLine(item)} ${item.uri}`).join('\n') }
  })

  on('tool.call', { tool: SPOTIFY_PLAY }, async ($, e) => {
    const input = e as unknown as { query?: unknown; type?: unknown }

    return { result: await spotifyPlay($, kindIn(input), typeof input.query === 'string' ? input.query : '') }
  })

  on('tool.call', { tool: SPOTIFY_QUEUE }, async ($, e) => {
    const input = e as unknown as { query?: unknown }

    return { result: await spotifyQueue($, typeof input.query === 'string' ? input.query : '') }
  })

  on('tool.call', { tool: SPOTIFY_LIKE }, async $ => ({ result: await spotifyLike($) }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!live.showBand || e.props.hasSurvey || (await read($, hiddenAtom))) return next(e)
    const player = await read($, playerAtom)
    if (player.kind !== 'ready' || player.track === null) return next(e)
    const track = player.track
    const playing = isPlaying(track)
    const sound = player.volume
    // ♥ saves to Liked Songs: only while Spotify itself plays and the sign-in is there.
    const canLike = appName(track.app) === 'Spotify' && (await read($, spotifyAtom)) !== null
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor={!playing}>{`${playing ? '♪' : '⏸'} ${trackLine(track, 60)}`}</Text>
        <Text dimColor>{`· ${appName(track.app)}`}</Text>
        <Button key="prev" label="⏮" onPress={() => void send($, 'previous')} />
        <Button key="toggle" label={playing ? '⏸' : '▶'} onPress={() => void send($, 'toggle')} />
        <Button key="next" label="⏭" onPress={() => void send($, 'next')} />
        {canLike && <Button key="like" label="♥" onPress={() => likeFromBand($)} />}
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
        <Button key="hide" label="✕" dimColor onPress={() => hideFromBand($)} />
      </Box>
    )
  })
}
