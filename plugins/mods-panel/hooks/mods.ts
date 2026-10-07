import type { CommandInfo } from 'claude-code'

import type { Hints } from '../types'

export type ModCommand = { name: string; description: string; hint: string | null | undefined }
export type Mod = { name: string; commands: ModCommand[] }

/** The plugin commands grouped per mod, mods and commands sorted by name. */
export function groupMods(commands: readonly CommandInfo[], hints: Hints, exclude?: string): Mod[] {
  const byMod = new Map<string, ModCommand[]>()

  for (const c of commands) {
    if (c.source !== 'plugin') continue
    const mod = c.plugin ?? (c.name.includes(':') ? c.name.split(':')[0]! : 'other')
    if (mod === exclude) continue
    const list = byMod.get(mod) ?? []
    list.push({ name: c.name, description: c.description, hint: hints[c.name] })
    byMod.set(mod, list)
  }

  return [...byMod]
    .map(([name, list]) => ({ name, commands: list.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Whether picking the command fills the prompt instead of running it: it
 * declares an argument hint, or the engine never told us whether it takes any.
 */
export function needsArgs(command: ModCommand): boolean {
  return command.hint !== null
}

/** What goes in the prompt box for a command that takes arguments. */
export function promptText(command: ModCommand): string {
  return `/${command.name} `
}

/** The button label: the command, then its hint, or an ellipsis when unknown. */
export function commandLabel(command: ModCommand): string {
  if (typeof command.hint === 'string') return `/${command.name} ${command.hint}`

  return command.hint === null ? `/${command.name}` : `/${command.name} …`
}

/** One digit hotkey for each of the first nine rows. */
export function hotkey(index: number): string | undefined {
  return index < 9 ? String(index + 1) : undefined
}
