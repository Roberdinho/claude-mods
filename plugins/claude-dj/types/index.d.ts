export type Track = {
  /** The media session's app id, e.g. `chrome.exe` or a packaged app's id. */
  app: string
  title: string
  artist: string
  album: string
  /** `Playing`, `Paused`, `Stopped`, ... as the OS reports it. */
  status: string
  /** Seconds, as of the moment the watcher reported the track. */
  position: number
  duration: number
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

declare module 'claude-code' {
  interface PluginState {
    'claude-dj': {
      player: Player
    }
  }
}
