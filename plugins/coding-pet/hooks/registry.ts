import type {
  CodingPetAchievement,
  CodingPetActivity,
  CodingPetFood,
  CodingPetRegistry,
  CodingPetSpecies,
  CodingPetStage,
} from '../types'

/** Every pet starts as the same egg; `{f}` is its face. */
export const EGG: [string[], string[]] = [
  ['  .--.  ', ' / {f}\\ ', ' \\____/ '],
  ['  .--.  ', ' /{f} \\ ', ' \\____/ '],
]

export const SPECIES: CodingPetSpecies[] = [
  {
    id: 'blob',
    emoji: '🫧',
    color: '#5BC0EB',
    names: ['Byte', 'Blip', 'Gloop', 'Pixel'],
    art: {
      baby: [
        ['  .-.  ', ' ({f}) ', "  '-'  "],
        ['       ', '  .-.  ', ' ({f}) '],
      ],
      teen: [
        ['  .---.  ', ' ( {f} ) ', "  '---'  "],
        ['  .---.  ', ' ( {f} ) ', "  '^-^'  "],
      ],
      adult: [
        ['  _/\\/\\_  ', ' ( {f}  ) ', "  '-----'  "],
        ['  _/\\/\\_  ', ' (  {f} ) ', "  '-----'  "],
      ],
    },
  },
  {
    id: 'cat',
    emoji: '🐈',
    color: '#E8B04A',
    names: ['Whiskers', 'Miso', 'Luna', 'Mittens'],
    art: {
      baby: [
        [' /\\_/\\ ', '( {f} )', ' (")(")'],
        [' /\\_/\\ ', '( {f} )', ' (") (")'],
      ],
      teen: [
        [' /\\_/\\  ', '( {f} ) ', ' (")(")~'],
        [' /\\_/\\  ', '( {f} ) ', ' (")(")_'],
      ],
      adult: [
        [' /\\_/\\    ', '( {f} )___', ' (")(")__)~'],
        [' /\\_/\\    ', '( {f} )___', ' (")(")__)_'],
      ],
    },
  },
  {
    id: 'crab',
    emoji: '🦀',
    color: '#E5533D',
    names: ['Ferris', 'Pinchy', 'Clacks', 'Clawd'],
    art: {
      baby: [
        [' ,  , ', '({f})', ' /  \\ '],
        [' ,  , ', '({f})', ' \\  / '],
      ],
      teen: [
        ['(\\/)  (\\/)', ' \\({f})/ ', '  /    \\ '],
        ['(\\/)  (\\/)', ' \\({f})/ ', '  \\    / '],
      ],
      adult: [
        ['(\\/)_____(\\/)', '  \\( {f} )/ ', '  //  ||  \\\\'],
        ['(\\/)_____(\\/)', '  \\( {f} )/ ', '  \\\\  ||  //'],
      ],
    },
  },
]

/** The level each stage starts at, in order. */
export const STAGES: { stage: CodingPetStage; level: number }[] = [
  { stage: 'egg', level: 1 },
  { stage: 'baby', level: 3 },
  { stage: 'teen', level: 10 },
  { stage: 'adult', level: 25 },
]

const MINUTE = 60_000

export const FOODS: CodingPetFood[] = [
  { id: 'apple', emoji: '🍎', effect: { fullness: 25, happiness: 3 }, cooldownMs: 0 },
  { id: 'pizza', emoji: '🍕', effect: { fullness: 45, happiness: 8, energy: -5 }, cooldownMs: 30 * MINUTE },
  { id: 'coffee', emoji: '☕', effect: { energy: 30, fullness: 5, happiness: 2 }, cooldownMs: 20 * MINUTE },
  { id: 'cookie', emoji: '🍪', effect: { happiness: 15, fullness: 10 }, cooldownMs: 10 * MINUTE },
]

/** Shell commands that run a test suite. */
export const TEST_COMMAND =
  '(^|[\\s;&|(])((npm|pnpm|yarn|bun)( run)? test|npx (jest|vitest|mocha|playwright test)|jest|vitest|mocha|pytest|python -m (pytest|unittest)|go test|cargo test|dotnet test|mvn( -\\S+)* test|gradlew? test|phpunit|rspec|mix test|deno test|ctest|claude plugin test)\\b'
/** Shell commands that make a git commit. */
export const COMMIT_COMMAND = '(^|[\\s;&|(])git(\\s+-\\S+(\\s+[^-\\s]\\S*)?)*\\s+commit\\b'

export const ACTIVITIES: CodingPetActivity[] = [
  { kind: 'commit', label: 'Commits', xp: 20, on: 'tool', tools: ['Bash', 'PowerShell'], command: COMMIT_COMMAND, cost: { energy: -2 }, cooldownMs: 10_000 },
  { kind: 'test', label: 'Passing tests', xp: 15, on: 'tool', tools: ['Bash', 'PowerShell'], command: TEST_COMMAND, cost: { energy: -2, happiness: 2 }, cooldownMs: 10_000 },
  { kind: 'edit', label: 'Edits', xp: 5, on: 'tool', tools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'], cost: { energy: -1, fullness: -1 }, cooldownMs: 2_000 },
  { kind: 'read', label: 'Files read', xp: 2, on: 'tool', tools: ['Read'], cost: {}, cooldownMs: 5_000 },
  { kind: 'prompt', label: 'Prompts', xp: 1, on: 'prompt', cost: {} },
  { kind: 'turn', label: 'Turns', xp: 3, on: 'turn', cost: { fullness: -1 } },
  { kind: 'toolFail', label: 'Failed tools', xp: 0, on: 'toolError', tools: ['*'], cost: { happiness: -3 } },
  { kind: 'play', label: 'Play', xp: 2, on: 'award', cost: {} },
  { kind: 'feed', label: 'Meals', xp: 1, on: 'award', cost: {} },
]

export const ACHIEVEMENTS: CodingPetAchievement[] = [
  { id: 'first-edit', title: 'First steps', emoji: '👣', description: 'Saw its first edit', when: { total: { kind: 'edit', atLeast: 1 } } },
  { id: 'first-commit', title: 'Committed', emoji: '📦', description: 'Saw its first commit', when: { total: { kind: 'commit', atLeast: 1 } } },
  { id: 'green-bar', title: 'Green bar', emoji: '✅', description: '10 passing test runs', when: { total: { kind: 'test', atLeast: 10 } } },
  { id: 'test-centurion', title: 'Test centurion', emoji: '🛡', description: '100 passing test runs', when: { total: { kind: 'test', atLeast: 100 } } },
  { id: 'bookworm', title: 'Bookworm', emoji: '📚', description: '500 files read', when: { total: { kind: 'read', atLeast: 500 } } },
  { id: 'chatterbox', title: 'Chatterbox', emoji: '💬', description: '100 prompts', when: { total: { kind: 'prompt', atLeast: 100 } } },
  { id: 'hatched', title: 'Hatched', emoji: '🐣', description: 'Reached level 3', when: { level: 3 } },
  { id: 'grown-up', title: 'All grown up', emoji: '🎓', description: 'Reached level 25', when: { level: 25 } },
  { id: 'well-fed', title: 'Well fed', emoji: '🍱', description: 'Fed 7 days in a row', when: { fedStreak: 7 } },
]

export const BUILT_IN: CodingPetRegistry = { species: SPECIES, foods: FOODS, activities: ACTIVITIES, achievements: ACHIEVEMENTS }

export const emptyRegistry = (): CodingPetRegistry => ({ species: [], foods: [], activities: [], achievements: [] })

/** Puts `row` in `rows`, replacing one with the same key. */
function upsert<T>(rows: readonly T[], row: T, key: (one: T) => string): T[] {
  const id = key(row)
  return rows.some(one => key(one) === id) ? rows.map(one => (key(one) === id ? row : one)) : [...rows, row]
}

/** The built-in tables with `extra`'s rows over them. */
export function mergeRegistry(base: CodingPetRegistry, extra: CodingPetRegistry): CodingPetRegistry {
  let { species, foods, activities, achievements } = base
  for (const one of extra.species) species = upsert(species, one, row => row.id)
  for (const one of extra.foods) foods = upsert(foods, one, row => row.id)
  // An added activity goes first, so it can claim a signal before the built-in rules.
  for (const one of extra.activities) activities = [one, ...activities.filter(row => row.kind !== one.kind)]
  for (const one of extra.achievements) achievements = upsert(achievements, one, row => row.id)

  return { species, foods, activities, achievements }
}

export function addTo<K extends keyof CodingPetRegistry>(
  registry: CodingPetRegistry,
  table: K,
  row: CodingPetRegistry[K][number],
): CodingPetRegistry {
  const key = (one: unknown): string => {
    const r = one as { id?: string; kind?: string }
    return r.id ?? r.kind ?? ''
  }
  return { ...registry, [table]: upsert(registry[table] as unknown[], row, key) }
}
