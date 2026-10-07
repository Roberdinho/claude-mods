import { describe, expect, mock, test } from 'claude-code/testing'

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0)

describe('the session', () => {
  test('in the desktop app the panel opens at start, and /pet opens it anywhere', async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on)
    let entrypoint = 'claude-desktop'
    on('env.get', (_$, e) => ({ value: e.name === 'CLAUDE_CODE_ENTRYPOINT' ? entrypoint : undefined }) as never)
    const opened: { id: string; focus?: boolean }[] = []
    on('ui.open', (_$, e) => {
      opened.push(e)
      return { value: undefined } as never
    })
    on('ui.close', () => ({ value: undefined }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))

    await $.session.start({ cwd: 'C:/work' } as never)
    expect(opened).toEqual([expect.objectContaining({ id: 'claude-pets' })])
    expect(opened[0]?.focus).toBeUndefined()

    // The panel draws the pets and a ball button; the strip steps aside meanwhile.
    const pane = await $.ui.mount({
      plugin: 'claude-pets',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'claude-pets',
      props: { title: 'Pets', isFocused: false, bodyColumns: 60 } as never,
    } as never)
    expect(await pane.find({ key: 'ball' })).toBeDefined()
    const band = await $.ui.mount({
      plugin: 'claude-pets',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100 } as never,
    })
    expect(await band.find({ key: 'ball' })).toBeUndefined()
    await band.unmount()
    await pane.press({ key: 'close' })
    await pane.unmount()

    // Hidden, the next start leaves it closed.
    await $.command.run({ command: 'pet', args: 'hide' } as never)
    await $.session.start({ cwd: 'C:/work' } as never)
    expect(opened.length).toBe(1)

    // A terminal starts with the strip; a bare /pet opens the panel there too.
    await $.command.run({ command: 'pet', args: 'show' } as never)
    expect(opened.length).toBe(2)
    entrypoint = 'cli'
    await $.session.start({ cwd: 'C:/work' } as never)
    expect(opened.length).toBe(2)
    await $.command.run({ command: 'pet', args: '' } as never)
    expect(opened.length).toBe(3)
    expect(opened[2]?.focus).toBe(true)
  })
})
