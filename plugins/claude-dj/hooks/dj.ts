import type { Track, Volume } from '../types'

// Pure helpers: what the watcher says, what the person typed, what to show.

export const ACTIONS = ['play', 'pause', 'toggle', 'next', 'previous'] as const
export type Action = (typeof ACTIONS)[number]

const ALIASES: Record<string, Action> = {
  play: 'play',
  resume: 'play',
  pause: 'pause',
  stop: 'pause',
  toggle: 'toggle',
  next: 'next',
  skip: 'next',
  prev: 'previous',
  previous: 'previous',
  back: 'previous',
}

/** `/dj next` → `next`; an empty argument toggles; anything else is unknown. */
export function actionOf(args: string): Action | undefined {
  const word = args.trim().toLowerCase()

  return word === '' ? 'toggle' : ALIASES[word]
}

export type WatcherLine = { track: Track | null; volume: Volume | null } | { error: string }

/** One line the watcher printed, or undefined for a line that is not its JSON. */
export function parseLine(line: string): WatcherLine | undefined {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(trimmed)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const o = raw as Record<string, unknown>
  if (typeof o.error === 'string') return { error: o.error }
  const text = (v: unknown): string => (typeof v === 'string' ? v : '')
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  // -1 (or nothing) when the watcher could not read the output device.
  const volume: Volume | null =
    typeof o.volume === 'number' && o.volume >= 0 ? { level: Math.round(o.volume), muted: o.muted === true } : null
  if (o.none === true) return { track: null, volume }
  if (typeof o.title !== 'string') return undefined

  return {
    volume,
    track: {
      app: text(o.app),
      title: o.title,
      artist: text(o.artist),
      album: text(o.album),
      status: text(o.status),
      position: num(o.position),
      positionAt: num(o.positionAt),
      duration: num(o.duration),
      cover: text(o.cover),
      coverJpg: text(o.coverJpg),
    },
  }
}

/** Splits streamed text into whole lines, keeping the unfinished tail. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/)
  const rest = parts.pop() ?? ''

  return { lines: parts, rest }
}

export const isPlaying = (track: Track | null): boolean => track?.status === 'Playing'

/** Where the track is now: the reported position, moved on by the time since while it plays. */
export function positionNow(track: Track, now: number): number {
  const moved = isPlaying(track) && track.positionAt > 0 ? Math.max(0, (now - track.positionAt) / 1000) : 0
  const at = track.position + moved

  return track.duration > 0 ? Math.min(track.duration, at) : at
}

/** `━━━━●──────`, `width` cells long, the knob where `position` is of `duration`. */
export function progressBar(position: number, duration: number, width: number): string {
  const cells = Math.max(5, Math.floor(width))
  const share = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0
  const done = Math.round(share * (cells - 1))

  return `${'━'.repeat(done)}●${'─'.repeat(cells - 1 - done)}`
}

/** The cover as an SVG of `size` px with rounded corners; a note on a plain square without one. */
export function coverSvg(jpegBase64: string | undefined, size: number): string {
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">`
  if (jpegBase64 === undefined) {
    return `${head}<rect width="100" height="100" rx="8" fill="#8884"/><text x="50" y="64" font-size="44" text-anchor="middle" fill="#8888">♪</text></svg>`
  }

  return `${head}<defs><clipPath id="c"><rect width="100" height="100" rx="8"/></clipPath></defs><image href="data:image/jpeg;base64,${jpegBase64}" width="100" height="100" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/></svg>`
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number): string => String(n).padStart(2, '0')

  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** A friendly name for the app behind the media session. */
export function appName(app: string): string {
  const id = app.toLowerCase()
  if (id.includes('spotify')) return 'Spotify'
  if (id.includes('youtube') || id.includes('ytm')) return 'YouTube Music'
  if (id.includes('chrome')) return 'Chrome'
  if (id.includes('msedge') || id.includes('edge')) return 'Edge'
  if (id.includes('firefox') || id === '308046b0af4a39cb') return 'Firefox'
  if (id.includes('brave')) return 'Brave'

  return app.replace(/\.exe$/i, '').split(/[!\\/]/).at(-1) ?? app
}

/** `Title — Artist`, shortened to `max` characters. */
export function trackLine(track: Track, max = 80): string {
  const line = track.artist === '' ? track.title : `${track.title} — ${track.artist}`

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** What the model reads from the now_playing tool and after a control. */
export function describe(track: Track | null): string {
  if (track === null) return 'Nothing is playing: no app has an active media session.'
  const parts = [
    `${track.status}: "${track.title}"`,
    track.artist !== '' ? `by ${track.artist}` : '',
    track.album !== '' ? `from "${track.album}"` : '',
    `in ${appName(track.app)}`,
  ].filter(part => part !== '')
  const time = track.duration > 0 ? ` (${formatTime(track.position)} / ${formatTime(track.duration)})` : ''

  return `${parts.join(' ')}${time}.`
}

export const PAST: Record<Action, string> = {
  play: 'Playing',
  pause: 'Paused',
  toggle: 'Toggled play/pause',
  next: 'Skipped to the next track',
  previous: 'Went back a track',
}

export type VolumeChange =
  | { kind: 'set'; level: number }
  | { kind: 'step'; by: number }
  | { kind: 'mute' | 'unmute' | 'togglemute' }

/**
 * `/vol 40`, `/vol +5`, `/vol up`, `/vol mute`; `show` for no argument,
 * undefined for words it does not know. `step` is what up and down move.
 */
export function volumeOf(args: string, step: number): VolumeChange | 'show' | undefined {
  const word = args.trim().toLowerCase().replace(/%$/, '')
  if (word === '') return 'show'
  if (word === 'up' || word === '+' || word === 'louder') return { kind: 'step', by: step }
  if (word === 'down' || word === '-' || word === 'quieter' || word === 'softer') return { kind: 'step', by: -step }
  if (word === 'mute' || word === 'unmute') return { kind: word }
  if (word === 'togglemute' || word === 'toggle') return { kind: 'togglemute' }
  if (/^[+-]\d{1,3}$/.test(word)) return { kind: 'step', by: Number(word) }
  if (/^\d{1,3}$/.test(word) && Number(word) <= 100) return { kind: 'set', level: Number(word) }

  return undefined
}

/** The watcher's command line for a volume change. */
export function volumeCommand(change: VolumeChange): string {
  if (change.kind === 'set') return `volume ${Math.max(0, Math.min(100, Math.round(change.level)))}`
  if (change.kind === 'step') return `volume ${change.by >= 0 ? '+' : '-'}${Math.min(100, Math.abs(Math.round(change.by)))}`

  return change.kind
}

export function describeVolume(volume: Volume | null): string {
  if (volume === null) return 'The volume is unknown: no output device answered.'

  return volume.muted ? `The volume is muted (${volume.level}% when unmuted).` : `The volume is ${volume.level}%.`
}

export function volumePast(change: VolumeChange): string {
  if (change.kind === 'set') return `Volume set to ${change.level}%`
  if (change.kind === 'step') return change.by >= 0 ? 'Volume up' : 'Volume down'
  if (change.kind === 'togglemute') return 'Toggled mute'

  return change.kind === 'mute' ? 'Muted' : 'Unmuted'
}
