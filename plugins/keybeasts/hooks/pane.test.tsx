import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const PANE = {
  plugin: 'keybeasts',
  component: 'Pane',
  requestId: 'keybeasts',
  props: {
    title: 'Keybeasts',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** Stelt de engine voor; de opslag onthoudt wat er geschreven wordt, zoals het gedeelde $.store-bestand. */
const engine = (on: On, stored?: unknown) => {
  const store = { value: stored }
  on('command.register', () => ({ value: { command: 'keybeasts' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('store.get', () => ({ value: store.value }))
  on('store.set', (_, e) => {
    store.value = JSON.parse(JSON.stringify((e as { value: unknown }).value))
    return { value: undefined }
  })
  on('clock.now', () => ({ value: 1_000_000 }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  return store
}

test('bij de eerste start verschijnt de starter-keuze', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Kies je eerste Keybeast/ }))).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'kies-hond' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'kies-konijn' })).toBeUndefined()
  await ui.unmount()
})

test('na het kiezen staat het beestje er en levert een tool-call keys op', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'kies-kat' })
  expect(await ui.find({ type: 'Text', text: /^Kat$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /⌨ 0/ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(await ui.find({ type: 'Text', text: /⌨ 2/ })).toBeDefined()
  await ui.unmount()
})

test('wisselen van beestje', async ($, on) => {
  engine(on, { v: 1, keys: 0, owned: ['hond', 'konijn'], active: 'hond', tutorialStep: 99 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Hond$/ })).toBeDefined()
  await ui.press({ key: 'wissel-konijn' })
  expect(await ui.find({ type: 'Text', text: /^Konijn$/ })).toBeDefined()
  await ui.unmount()
})

test('alle sessies delen één save: wat een andere sessie schreef telt mee', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'kies-hond' })
  expect((store.value as { owned: string[] }).owned).toEqual(['hond'])

  // Een andere sessie verdient intussen 100 keys.
  store.value = { ...(store.value as object), keys: 100 }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect((store.value as { keys: number }).keys).toBe(102)
  expect(await ui.find({ type: 'Text', text: /⌨ 102/ })).toBeDefined()
  await ui.unmount()
})

test('in Spullen zie je waar een emote op reageert en zet je hem aan of uit', async ($, on) => {
  const store = engine(on, { v: 1, keys: 0, owned: ['hond'], active: 'hond', tutorialStep: 99, inventory: { uitroep: 1 } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-spullen' })
  expect(await ui.find({ type: 'Button', text: /✓ Uitroepteken: als een tool-call mislukt/ })).toBeDefined()
  await ui.press({ key: 'item-uitroep' })
  expect((store.value as { emotesOff: string[] }).emotesOff).toEqual(['uitroep'])
  expect(await ui.find({ type: 'Button', text: /○ Uitroepteken/ })).toBeDefined()
  await ui.unmount()
})
