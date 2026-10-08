import { describe, expect, mock, test } from 'claude-code/testing'

const T0 = Date.UTC(2026, 9, 7, 12, 0, 0)

describe('the session', () => {
  test('the panel never opens by itself; /pet and /pet show open it', async ($, on) => {
    mock.clock(on, { now: T0 })
    mock.store(on)
    on('env.get', (_$, e) => ({ value: e.name === 'CLAUDE_CODE_ENTRYPOINT' ? 'claude-desktop' : undefined }) as never)
    const opened: { id: string; focus?: boolean }[] = []
    on('ui.open', (_$, e) => {
      opened.push(e)
      return { value: undefined } as never
    })
    on('ui.close', () => ({ value: undefined }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))

    // Even in the desktop app, a session starts with the panel closed.
    await $.session.start({ cwd: 'C:/work' } as never)
    expect(opened).toEqual([])

    await $.command.run({ command: 'pet', args: '' } as never)
    expect(opened).toEqual([expect.objectContaining({ id: 'claude-pets', focus: true })])

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

    // The next start leaves it closed again; /pet show opens it.
    await $.session.start({ cwd: 'C:/work' } as never)
    expect(opened.length).toBe(1)
    await $.command.run({ command: 'pet', args: 'show' } as never)
    expect(opened.length).toBe(2)
  })
})
