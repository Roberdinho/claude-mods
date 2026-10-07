export type Snap = {
  /** The prompt as drawn (already redacted when that is on). */
  text: string
  project: string
  model: string
  /** Caption date, e.g. "7 Oct 2026". */
  date: string
  /** File-name stamp, e.g. "2026-10-07_1432". */
  stamp: string
}

export type Saved = {
  png?: string
  svg?: string
  /** Bumped on each PNG write so the terminal Image re-reads the file. */
  generation: number
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-polaroid': {
      snap: Snap | null
      theme: number
      saved: Saved | null
    }
  }
}
