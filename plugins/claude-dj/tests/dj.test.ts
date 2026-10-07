import { describe, expect, mock, test } from 'claude-code/testing'

import {
  actionOf,
  appName,
  describe as describeTrack,
  describeVolume,
  formatTime,
  parseLine,
  splitLines,
  trackLine,
  volumeCommand,
  volumeOf,
} from '../hooks/dj'
import { WINDOWS_WATCHER } from '../hooks/host'

const SONG = {
  app: 'chrome.exe',
  title: 'Midnight City',
  artist: 'M83',
  album: "Hurry Up, We're Dreaming",
  status: 'Playing',
  position: 61,
  duration: 243,
}

const line = (value: unknown): string => `${JSON.stringify(value)}\n`

describe('reading the watcher', () => {
  test('parses a track, nothing playing, and an error', () => {
    expect(parseLine(JSON.stringify(SONG))).toEqual({ track: SONG, volume: null })
    expect(parseLine('{"none":true}')).toEqual({ track: null, volume: null })
    expect(parseLine('{"error":"boom"}')).toEqual({ error: 'boom' })
  })

  test('parses the volume, and -1 as unknown', () => {
    expect(parseLine(JSON.stringify({ ...SONG, volume: 40, muted: true }))).toEqual({
      track: SONG,
      volume: { level: 40, muted: true },
    })
    expect(parseLine('{"none":true,"volume":55,"muted":false}')).toEqual({
      track: null,
      volume: { level: 55, muted: false },
    })
    expect(parseLine('{"none":true,"volume":-1,"muted":false}')).toEqual({ track: null, volume: null })
  })

  test('ignores what is not its JSON', () => {
    expect(parseLine('')).toBeUndefined()
    expect(parseLine('WARNING: something')).toBeUndefined()
    expect(parseLine('{not json')).toBeUndefined()
    expect(parseLine('{"app":"x"}')).toBeUndefined()
  })

  test('fills in missing fields', () => {
    expect(parseLine('{"title":"Only a title"}')).toEqual({
      volume: null,
      track: { app: '', title: 'Only a title', artist: '', album: '', status: '', position: 0, duration: 0 },
    })
  })

  test('splits streamed text into lines, keeping the tail', () => {
    expect(splitLines('a\r\nb\nc')).toEqual({ lines: ['a', 'b'], rest: 'c' })
    expect(splitLines('partial')).toEqual({ lines: [], rest: 'partial' })
  })

  test('the watcher script stays ASCII, as PowerShell 5.1 reads it', () => {
    expect(/^[\x00-\x7f]*$/.test(WINDOWS_WATCHER)).toBe(true)
    expect(WINDOWS_WATCHER.includes('IAsyncOperation`1')).toBe(true)
  })
})

describe('words', () => {
  test('actions and their aliases', () => {
    expect(actionOf('')).toBe('toggle')
    expect(actionOf(' Next ')).toBe('next')
    expect(actionOf('skip')).toBe('next')
    expect(actionOf('prev')).toBe('previous')
    expect(actionOf('resume')).toBe('play')
    expect(actionOf('louder')).toBeUndefined()
  })

  test('volume words and the watcher lines they become', () => {
    expect(volumeOf('', 10)).toBe('show')
    expect(volumeOf('40', 10)).toEqual({ kind: 'set', level: 40 })
    expect(volumeOf('40%', 10)).toEqual({ kind: 'set', level: 40 })
    expect(volumeOf('101', 10)).toBeUndefined()
    expect(volumeOf('up', 5)).toEqual({ kind: 'step', by: 5 })
    expect(volumeOf('quieter', 5)).toEqual({ kind: 'step', by: -5 })
    expect(volumeOf('+15', 10)).toEqual({ kind: 'step', by: 15 })
    expect(volumeOf('-15', 10)).toEqual({ kind: 'step', by: -15 })
    expect(volumeOf('Mute', 10)).toEqual({ kind: 'mute' })
    expect(volumeOf('blast it', 10)).toBeUndefined()
    expect(volumeCommand({ kind: 'set', level: 140 })).toBe('volume 100')
    expect(volumeCommand({ kind: 'step', by: 15 })).toBe('volume +15')
    expect(volumeCommand({ kind: 'step', by: -15 })).toBe('volume -15')
    expect(volumeCommand({ kind: 'unmute' })).toBe('unmute')
    expect(describeVolume({ level: 30, muted: false })).toBe('The volume is 30%.')
    expect(describeVolume({ level: 30, muted: true })).toBe('The volume is muted (30% when unmuted).')
  })

  test('times, apps and lines', () => {
    expect(formatTime(61)).toBe('1:01')
    expect(formatTime(3725)).toBe('1:02:05')
    expect(appName('chrome.exe')).toBe('Chrome')
    expect(appName('308046B0AF4A39CB')).toBe('Firefox')
    expect(appName('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify')).toBe('Spotify')
    expect(trackLine(SONG)).toBe('Midnight City — M83')
    expect(trackLine(SONG, 10)).toBe('Midnight …')
    expect(describeTrack(SONG)).toBe(
      'Playing: "Midnight City" by M83 from "Hurry Up, We\'re Dreaming" in Chrome (1:01 / 4:03).',
    )
    expect(describeTrack(null).startsWith('Nothing is playing')).toBe(true)
  })
})

describe('the session', () => {
  test('a fake watcher drives the band, /next, /vol and the tools', async ($, on) => {
    mock.env(on, { OS: 'Windows_NT', TEMP: 'C:\\Temp' })
    mock.store(on)
    // The watcher: says what plays, then answers `next` with the next song,
    // `volume <n>` with that volume and `mute` by muting.
    const files: Record<string, string> = {}
    let state: Record<string, unknown> = { ...SONG, volume: 40, muted: false }
    const queue: string[] = [line(state)]
    let wake: (() => void) | undefined
    on('fs.write', async (_$, e) => {
      files[e.path] = e.text
      if (e.path.endsWith('.cmd')) {
        if (e.text === 'next') state = { ...state, title: 'Wait', position: 0 }
        if (e.text === 'mute') state = { ...state, muted: true }
        const level = /^volume (\d+)$/.exec(e.text)?.[1]
        if (level !== undefined) state = { ...state, volume: Number(level) }
        queue.push(line(state))
        wake?.()
      }

      return { value: undefined }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__claude-dj__${e.name}` } }))
    // The engine beneath: its own (empty) band, status line and toasts.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', () => ({ value: undefined }))
    mock.clock(on, { now: 1_760_000_000_000 })
    on('process.spawn', async function* () {
      for (;;) {
        const next = queue.shift()
        if (next !== undefined) {
          yield { stream: 'stdout' as const, text: next }
          continue
        }
        await new Promise<void>(resolve => (wake = resolve))
      }
    })

    await $.session.start({ cwd: 'C:/work' } as never)
    expect(Object.keys(files).some(path => /[\\/]watch\.ps1$/.test(path))).toBe(true)
    // The watcher's first line arrives on its own time: ask until it has.
    let playing = ''
    for (let tries = 0; tries < 50 && !playing.includes('Playing:'); tries++) {
      playing = String((await $.tool.call({ tool: 'mcp__claude-dj__now_playing' } as never)).result)
    }
    expect(playing).toContain('Playing: "Midnight City" by M83')
    expect(playing).toContain('The volume is 40%.')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'claude-dj',
        surface,
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100 } as never,
      })
      expect(await ui.find({ type: 'Text', text: /Midnight City — M83/ })).toBeDefined()
      expect(await ui.find({ key: 'toggle' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '40%' })).toBeDefined()
      expect(await ui.find({ key: 'volup' })).toBeDefined()
      await ui.unmount()
    }

    // ✕ hides the band; /dj show brings it back, /dj hide hides it again.
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'claude-dj',
        surface,
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100 } as never,
      })
      await ui.press({ key: 'hide' })
      expect(await ui.find({ type: 'Text', text: /Midnight City/ })).toBeUndefined()
      const shownAgain = await $.command.run({ command: 'dj', args: 'show' } as never)
      expect(String(shownAgain.text)).toBe('Band shown.')
      expect(await ui.find({ type: 'Text', text: /Midnight City/ })).toBeDefined()
      const hidden = await $.command.run({ command: 'dj', args: 'Hide' } as never)
      expect(String(hidden.text)).toBe('Band hidden. /dj show brings it back.')
      expect(await ui.find({ type: 'Text', text: /Midnight City/ })).toBeUndefined()
      await $.command.run({ command: 'dj', args: 'show' } as never)
      await ui.unmount()
    }

    const ran = await $.command.run({ command: 'next', args: '' } as never)
    expect(Object.values(files)).toContain('next')
    expect(String(ran.text)).toContain('Skipped to the next track. Playing: "Wait"')

    const set = await $.command.run({ command: 'vol', args: '25' } as never)
    expect(Object.values(files)).toContain('volume 25')
    expect(String(set.text)).toBe('Volume set to 25%. The volume is 25%.')

    const shown = await $.command.run({ command: 'dj', args: 'vol' } as never)
    expect(String(shown.text)).toBe('The volume is 25%.')

    const unknown = await $.command.run({ command: 'vol', args: 'eleven' } as never)
    expect(String(unknown.text)).toContain('Unknown volume "eleven"')

    const muted = await $.tool.call({ tool: 'mcp__claude-dj__music_volume', mute: true } as never)
    expect(Object.values(files)).toContain('mute')
    expect(String(muted.result)).toBe('Muted. The volume is muted (25% when unmuted).')
  })
})
