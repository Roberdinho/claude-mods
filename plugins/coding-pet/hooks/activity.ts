import type { CodingPetActivity } from '../types'

/** Something that happened in the session that may earn XP. */
export type Signal =
  | { on: 'tool'; tool: string; command?: string; isError: boolean }
  | { on: 'prompt' }
  | { on: 'turn' }

const patterns = new Map<string, RegExp | null>()

/** A rule's command pattern, compiled once; a pattern that does not compile matches nothing. */
function patternOf(source: string): RegExp | null {
  let pattern = patterns.get(source)
  if (pattern === undefined) {
    try {
      pattern = new RegExp(source, 'i')
    } catch {
      pattern = null
    }
    patterns.set(source, pattern)
  }
  return pattern
}

function matches(rule: CodingPetActivity, signal: Signal): boolean {
  if (signal.on !== 'tool') return rule.on === signal.on
  if (rule.on !== (signal.isError ? 'toolError' : 'tool')) return false
  const tools = rule.tools ?? ['*']
  if (!tools.includes('*') && !tools.includes(signal.tool)) return false
  if (rule.command === undefined) return true
  const command = signal.command
  return command !== undefined && patternOf(rule.command)?.test(command) === true
}

/**
 * The activity a signal counts as: the first rule that matches, rules with a
 * command pattern before those without, so `git commit` in Bash is a commit
 * however the rules are ordered. Undefined when it earns nothing.
 */
export function classify(signal: Signal, rules: readonly CodingPetActivity[]): string | undefined {
  const ordered = [...rules.filter(rule => rule.command !== undefined), ...rules.filter(rule => rule.command === undefined)]
  return ordered.find(rule => matches(rule, signal))?.kind
}

/** The command a shell tool call ran, if it was one. */
export function commandOf(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const command = (input as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}
