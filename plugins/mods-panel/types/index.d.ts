/** Each command's argument hint as `command.describe` reported it; null when it takes none. */
export type Hints = Record<string, string | null>

declare module 'claude-code' {
  interface PluginState {
    'mods-panel': {
      /** The mod whose commands the panel shows; null shows the list of mods. */
      selected: string | null
      hints: Hints
      /** The mod whose uninstall is waiting on a yes; null when none is. */
      confirming: string | null
      /** The mod being uninstalled right now; null when none is. */
      uninstalling: string | null
    }
  }
}
