import { describe, expect, test } from 'claude-code/testing'
import type { CommandInfo } from 'claude-code'

import { commandLabel, groupMods, hotkey, needsArgs, promptText } from '../hooks/mods'

const COMMANDS: CommandInfo[] = [
  { name: 'help', description: 'Help', source: 'builtin' },
  { name: 'vol', description: 'Set volume', source: 'plugin', plugin: 'claude-dj' },
  { name: 'pause', description: 'Pause', source: 'plugin', plugin: 'claude-dj' },
  { name: 'polaroid', description: 'Snapshot', source: 'plugin', plugin: 'prompt-polaroid' },
  { name: 'mods', description: 'This one', source: 'plugin', plugin: 'mods-panel' },
  { name: 'pets:pet', description: 'Pet', source: 'plugin' },
  { name: 'deploy', description: 'Mine', source: 'user' },
]

describe('grouping', () => {
  test('lists only plugin commands, per mod, sorted, without itself', () => {
    const mods = groupMods(COMMANDS, {}, 'mods-panel')
    expect(mods.map(m => m.name)).toEqual(['claude-dj', 'pets', 'prompt-polaroid'])
    expect(mods[0]!.commands.map(c => c.name)).toEqual(['pause', 'vol'])
  })
})

describe('picking', () => {
  test('runs commands known to take no arguments and fills the rest', () => {
    const dj = groupMods(COMMANDS, { pause: null, vol: '<0-100>' })[0]!
    const pause = dj.commands.find(c => c.name === 'pause')!
    const vol = dj.commands.find(c => c.name === 'vol')!
    expect(needsArgs(pause)).toBe(false)
    expect(needsArgs(vol)).toBe(true)
    expect(promptText(vol)).toBe('/vol ')
    expect(commandLabel(vol)).toBe('/vol <0-100>')
    expect(commandLabel(pause)).toBe('/pause')
  })

  test('fills the prompt when it is unknown whether a command takes arguments', () => {
    const unknown = groupMods(COMMANDS, {})[0]!.commands[0]!
    expect(needsArgs(unknown)).toBe(true)
    expect(commandLabel(unknown)).toBe('/pause …')
  })

  test('hotkeys the first nine rows', () => {
    expect(hotkey(0)).toBe('1')
    expect(hotkey(8)).toBe('9')
    expect(hotkey(9)).toBe(undefined)
  })
})
