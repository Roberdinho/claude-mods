import { describe, expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0)

/** Another plugin built on this one: `/addon get` reads the pet, `/addon award` grants XP and adds a food. */
const addon: Plugin = {
  name: 'pet-addon',
  register(on) {
    on('session.start', async ($, e, next) => {
      const started = await next(e)
      await $.command.register({ name: 'addon', description: 'Reaches the coding pet' })
      return started
    })
    on('command.run', { command: 'addon' }, async ($, e) => {
      if (e.args === 'award') {
        await $.codingPet.award({ kind: 'music', xp: 10, reason: 'coded to music' })
        await $.codingPet.addFood({ id: 'taco', emoji: '🌮', effect: { fullness: 30 }, cooldownMs: 0 })
        return { text: 'awarded' }
      }
      return { text: JSON.stringify(await $.codingPet.get()) }
    })
  },
}

describe('the session', () => {
  test(
    'coding earns XP, care works, the band and pane draw, and other plugins can reach it',
    { options: { petName: 'Byte', species: 'cat' }, plugins: [addon] },
    async ($, on) => {
      const clock = mock.clock(on, { now: T0 })
      mock.store(on)
      const toasts: string[] = []
      on('ui.toast', (_$, e) => {
        toasts.push(e.text)
        return { value: undefined }
      })
      const statuses: (string | undefined)[] = []
      on('ui.status', (_$, e) => {
        statuses.push(e.text)
        return { value: undefined }
      })
      on('ui.close', () => ({ value: undefined }))
      on('ui.open', () => ({ value: undefined }) as never)
      // The engine's own band beneath the pet's draws nothing.
      on('ui.render', ($, e) => {
        const { Box } = $.ui.resolve(e)
        return h(Box, {}) as never
      })
      on('session.start', (_$, e) => ({ cwd: e.cwd }))
      on('command.register', (_$, e) => ({ value: { command: e.name } }))
      on('tool.register', (_$, e) => ({ value: { tool: `mcp__coding-pet__${e.name}` } }))
      // The tools themselves: a command that says FAIL fails, everything else works.
      on('tool.call', (_$, e) => {
        const command = (e as unknown as { command?: string }).command ?? ''
        return (command.includes('FAIL') ? { result: 'failed', isError: true } : { result: 'ok' }) as never
      })
      const pet = async () => JSON.parse(String((await $.command.run({ command: 'addon', args: 'get' } as never)).text))

      await $.session.start({ cwd: 'C:/work' } as never)
      expect(await pet()).toMatchObject({ name: 'Byte', species: 'cat', level: 1, stage: 'egg', xp: 0 })

      await $.tool.call({ tool: 'Edit', file_path: 'a.ts', old_string: 'a', new_string: 'b' } as never)
      await clock.advance(3_000)
      await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
      await clock.advance(11_000)
      await $.tool.call({ tool: 'Bash', command: 'npm test FAIL' } as never)
      await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat"' } as never)

      const coded = await pet()
      expect(coded.totalXp).toBe(5 + 15 + 20)
      expect(coded.achievements).toEqual(expect.arrayContaining(['first-edit', 'first-commit']))
      expect(toasts.some(text => text.includes('Committed'))).toBe(true)

      const fed = await $.command.run({ command: 'codepet', args: 'feed cookie' } as never)
      expect(String(fed.text)).toContain('munches the 🍪 cookie')
      const unknown = await $.command.run({ command: 'codepet', args: 'dance' } as never)
      expect(String(unknown.text)).toContain('Unknown "dance"')
      const stats = await $.command.run({ command: 'codepet', args: 'stats' } as never)
      expect(String(stats.text)).toContain('Byte the cat (egg), level 1')

      // Another plugin grants XP and adds a food.
      await $.command.run({ command: 'addon', args: 'award' } as never)
      expect((await pet()).totalXp).toBe(5 + 15 + 20 + 1 + 10)
      const menu = await $.command.run({ command: 'codepet', args: 'foods' } as never)
      expect(String(menu.text)).toContain('🌮 taco')

      for (const surface of ['terminal', 'desktop'] as const) {
        const band = await $.ui.mount({
          plugin: 'coding-pet',
          surface,
          component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
        })
        expect(await band.find({ type: 'Text', text: 'Byte' })).toBeDefined()
        expect(await band.find({ key: 'feed' })).toBeDefined()
        expect(await band.find({ key: 'panel' })).toBeDefined()
        await band.press({ key: 'play' })
        await band.unmount()

        const narrow = await $.ui.mount({
          plugin: 'coding-pet',
          surface,
          component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 40 } as never,
        })
        expect(await narrow.find({ key: 'rest' })).toBeDefined()
        await narrow.unmount()

        const pane = await $.ui.mount({
          plugin: 'coding-pet',
          surface,
          component: 'Pane',
          requestId: 'coding-pet',
          props: { title: 'Byte', isFocused: true, bodyColumns: 60 } as never,
        } as never)
        expect(await pane.find({ type: 'Text', text: /Achievements \d+\/9/ })).toBeDefined()
        expect(await pane.find({ key: 'food:taco' })).toBeDefined()
        expect(await pane.find({ key: 'close' })).toBeDefined()
        if (surface === 'desktop') expect(await pane.find({ type: 'Svg' })).toBeDefined()
        expect(await pane.find({ type: 'Text', text: 'Happiness ' })).toBeDefined()
        await pane.unmount()
      }
      expect(toasts.some(text => text.includes('chases a ball'))).toBe(true)

      await $.command.run({ command: 'codepet', args: '' } as never)
      const stepped = await $.ui.mount({
        plugin: 'coding-pet',
        surface: 'desktop',
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
      })
      expect(await stepped.find({ key: 'feed' })).toBeUndefined()
      await stepped.unmount()
      const strip = async () => {
        const band = await $.ui.mount({
          plugin: 'coding-pet',
          surface: 'desktop',
          component: 'AbovePrompt',
          props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
        })
        const isShown = (await band.find({ key: 'feed' })) !== undefined
        await band.unmount()
        return isShown
      }

      // /codepet close puts away the panel and the strip; it still speaks up.
      const closed = await $.command.run({ command: 'codepet', args: 'close' } as never)
      expect(String(closed.text)).toContain('panel and strip are closed')
      expect(await strip()).toBe(false)
      // Opening and closing the panel by itself leaves the strip put away.
      await $.command.run({ command: 'codepet', args: '' } as never)
      const panel = await $.ui.mount({
        plugin: 'coding-pet',
        surface: 'desktop',
        component: 'Pane',
        requestId: 'coding-pet',
        props: { title: 'Byte', isFocused: true, bodyColumns: 60 } as never,
      } as never)
      await panel.press({ key: 'close' })
      await panel.unmount()
      expect(await strip()).toBe(false)
      // /codepet show brings the strip back.
      const back = await $.command.run({ command: 'codepet', args: 'show' } as never)
      expect(String(back.text)).toContain('back above the prompt')
      expect(await strip()).toBe(true)

      // Hidden, it is silent: hours later it is hungry, and says nothing.
      const hidden = await $.command.run({ command: 'codepet', args: 'hide' } as never)
      expect(String(hidden.text)).toContain('hidden and silent')
      expect(statuses[statuses.length - 1]).toBeUndefined()
      const quiet = toasts.length
      await clock.advance(10 * 3_600_000)
      await $.command.run({ command: 'addon', args: 'award' } as never)
      expect((await pet()).mood).toBe('hungry')
      expect(toasts.length).toBe(quiet)
      const band = await $.ui.mount({
        plugin: 'coding-pet',
        surface: 'desktop',
        component: 'AbovePrompt',
        props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
      })
      expect(await band.find({ key: 'feed' })).toBeUndefined()
      await band.unmount()

      // Shown again, it says what it needs once, in the reply rather than a burst of toasts.
      const shown = await $.command.run({ command: 'codepet', args: 'show' } as never)
      expect(String(shown.text)).toContain('It is hungry')
      expect(toasts.length).toBe(quiet)
    },
  )
})
