import { expect, mock, test } from 'claude-code/testing'
import type { RenderPropsOf } from 'claude-code'

const PANE: RenderPropsOf['Pane'] = {
  title: 'OmniRealm',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const target = <S extends 'terminal' | 'desktop'>(surface: S) =>
  ({ plugin: 'omnirealm', surface, component: 'Pane', requestId: 'omnirealm', props: PANE }) as const

test('terminal: the world draws as text, runs and answers keys', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('terminal'))
  await ui.resize({ columns: 100, rows: 40, in: 'world' })
  expect(await ui.find({ in: 'world', text: /OmniRealm/ })).toBeDefined()
  expect(await ui.find({ in: 'world', text: /Year 0/ })).toBeDefined()

  // Time passes: a year is 48 ticks of 120 ms.
  await ui.advance(120 * 50)
  expect(await ui.find({ in: 'world', text: /Year 1/ })).toBeDefined()

  // The realms view lists the kingdoms the seeded peoples founded.
  await ui.key({ key: 'r', in: 'world' })
  expect(await ui.find({ in: 'world', text: /Realms of the world \([1-9]/ })).toBeDefined()
  await ui.key({ key: 'r', in: 'world' })

  // Pausing stops the clock.
  await ui.key({ key: ' ', in: 'world' })
  expect(await ui.find({ in: 'world', text: /paused/ })).toBeDefined()
  await ui.advance(120 * 60)
  expect(await ui.find({ in: 'world', text: /Year 1 / })).toBeDefined()
  await ui.unmount()
})

test('terminal: an atomic bomb is logged in the chronicle', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('terminal'))
  await ui.resize({ columns: 100, rows: 40, in: 'world' })
  await ui.key({ key: ' ', in: 'world' })
  // The world opens on Life; Destroy is the next category, Atomic its fourth tool.
  await ui.key({ key: 'tab', in: 'world' })
  for (let n = 0; n < 3; n++) await ui.key({ key: 'e', in: 'world' })
  expect(await ui.find({ in: 'world', text: /^ Atomic $/ })).toBeDefined()
  await ui.pointer({ type: 'down', x: 40, y: 10, button: 'left' })
  await ui.pointer({ type: 'up', x: 40, y: 10, button: 'left' })
  expect(await ui.find({ in: 'world', text: /atomic bomb detonates/ })).toBeDefined()
  await ui.unmount()
})

test('terminal: a large pane stays inside the bounds a Client tree is held to', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('terminal'))
  await ui.resize({ columns: 200, rows: 70, in: 'world' })
  await ui.key({ key: 'b', in: 'world' })
  await ui.key({ key: 'z', in: 'world' })
  await ui.advance(120 * 300)
  expect(JSON.stringify(await ui.drawn({ in: 'world' })).length).toBeLessThan(100_000)
  await ui.unmount()
})

test('terminal: a saved world loads back', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('terminal'))
  await ui.resize({ columns: 100, rows: 40, in: 'world' })
  await ui.advance(120 * 100)
  await ui.key({ key: 'S', in: 'world' })
  await ui.key({ key: 'L', in: 'world' })
  await ui.key({ key: 'r', in: 'world' })
  expect(await ui.find({ in: 'world', text: /restored from a save/ })).toBeDefined()
  await ui.unmount()
})

test('desktop: the map is a pixel-art picture under the game, which buttons drive', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('desktop'))
  await ui.resize({ columns: 90, rows: 30, in: 'world' })
  await ui.advance(120 * 50)
  const svg = await ui.find({ type: 'Svg' })
  expect(svg).toBeDefined()
  const source = String(svg?.props.source ?? '')
  expect(source.startsWith('<svg')).toBe(true)
  expect(source.length).toBeLessThan(131_072)
  expect(await ui.find({ text: /Year 1/ })).toBeDefined()

  // Buttons reach the game: pause, pick the atomic bomb, drop it on the map.
  await ui.press({ key: 'pause' })
  expect(await ui.find({ text: /paused/ })).toBeDefined()
  await ui.select({ key: 'cat', value: 'destroy' })
  await ui.select({ key: 'tool', value: 'atomic' })
  expect(await ui.find({ text: /^Atomic/ })).toBeDefined()
  await ui.pointer({ type: 'down', x: 45, y: 15, button: 'left', in: 'world' })
  await ui.pointer({ type: 'up', x: 45, y: 15, button: 'left', in: 'world' })
  expect(await ui.find({ text: /atomic bomb detonates/ })).toBeDefined()

  // The realms view is drawn by the pane, the map still there.
  await ui.press({ key: 'realms' })
  expect(await ui.find({ text: /Realms of the world/ })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()
})

test('desktop: a saved world loads back', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount(target('desktop'))
  await ui.resize({ columns: 90, rows: 30, in: 'world' })
  await ui.advance(120 * 100)
  await ui.press({ key: 'save' })
  await ui.advance(120)
  await ui.press({ key: 'load' })
  await ui.advance(120)
  await ui.press({ key: 'realms' })
  await ui.advance(120)
  expect(await ui.find({ text: /restored from a save/ })).toBeDefined()
  await ui.unmount()
})
