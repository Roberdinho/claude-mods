export type Track = {
  /** The media session's app id, e.g. `chrome.exe` or a packaged app's id. */
  app: string
  title: string
  artist: string
  album: string
  /** `Playing`, `Paused`, `Stopped`, ... as the OS reports it. */
  status: string
  /** Seconds, as of `positionAt`. */
  position: number
  /** When the app last set `position`, ms since the epoch; 0 when unknown. */
  positionAt: number
  duration: number
  /** The cover as a PNG file (for the terminal), or ''. */
  cover: string
  /** The cover as a small JPEG file (for the SVG the other surfaces draw), or ''. */
  coverJpg: string
}

/** The default output device's volume, as the volume keys change it. */
export type Volume = {
  /** 0 to 100. */
  level: number
  muted: boolean
}

export type Player =
  | { kind: 'starting' }
  /** The watcher runs; `track` is null when nothing is playing anywhere. */
  | { kind: 'ready'; track: Track | null; volume: Volume | null }
  | { kind: 'unavailable'; reason: string }

/** The Spotify account the Web API features run as; null when not signed in. */
export type SpotifyStatus = {
  name: string
  /** `premium`, `free`, ...: playback control needs premium. */
  product: string
}

declare module 'claude-code' {
  interface PluginState {
    'claude-dj': {
      player: Player
      spotify: SpotifyStatus | null
      /** The band hidden with ✕ or /dj hide; kept in `$.store` across sessions. */
      isHidden: boolean
      /** Bumped every second while the /music pane is open and music plays, so the progress bar moves. */
      tick: number
    }
  }
}
