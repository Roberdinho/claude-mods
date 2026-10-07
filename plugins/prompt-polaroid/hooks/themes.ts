export type Theme = {
  id: string
  label: string
  /** Gradient stops behind the card; empty means transparent. */
  stops: readonly string[]
  /** Accent for the prompt glyph. */
  accent: string
}

export const THEMES: readonly Theme[] = [
  { id: 'clay', label: 'Claude Clay', stops: ['#D97757', '#F0C7A8', '#F5EEE6'], accent: '#D97757' },
  { id: 'sunset', label: 'Sunset', stops: ['#FF5F6D', '#FFC371'], accent: '#FF8A65' },
  { id: 'ocean', label: 'Ocean', stops: ['#2E3192', '#1BFFFF'], accent: '#4FC3F7' },
  { id: 'forest', label: 'Forest', stops: ['#134E5E', '#71B280'], accent: '#81C784' },
  { id: 'mono', label: 'Mono', stops: ['#232526', '#5A5F63'], accent: '#BDBDBD' },
  { id: 'transparent', label: 'Transparent', stops: [], accent: '#D97757' },
]

export const themeIndex = (id: unknown): number => {
  const found = THEMES.findIndex(theme => theme.id === id)

  return found < 0 ? 0 : found
}

export const themeAt = (index: number): Theme =>
  THEMES[((index % THEMES.length) + THEMES.length) % THEMES.length] ?? THEMES[0]!
