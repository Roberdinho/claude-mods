export type Grouping = 'project' | 'state' | 'other' | null

declare module 'claude-code' {
  interface PluginState {
    'group-toggle': { grouping: Grouping; lastError: string | null }
  }
}
