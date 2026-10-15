import { describe, expect, mock, test } from 'claude-code/testing'

describe('the session', () => {
  test('reads the grouping, the band and /group switch it', async ($, on) => {
    let groupBy = 'project'
    const calls: string[] = []
    on('mcp.call', (_$, e) => {
      calls.push(`${e.tool}${e.args?.group_by ? ` ${String(e.args.group_by)}` : ''}`)
      if (e.tool === 'set_view') groupBy = String(e.args?.group_by)
      const text = e.tool === 'list_sections'
        ? JSON.stringify([{ id: 'pinned', group_by: 'none' }, { id: 'sessions', group_by: groupBy }])
        : JSON.stringify({ group_by: groupBy })
      return { value: { content: [{ type: 'text', text }], isError: false } }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    // The engine beneath: another mod's band.
    on('ui.render', { component: 'AbovePrompt' }, () => ({
      type: 'Box', props: {}, children: [{ type: 'Text', props: {}, children: ['♪ Midnight City'] }],
    }))
    on('ui.toast', () => ({ value: undefined }))

    await $.session.start({ cwd: 'C:/work' } as never)
    const ui = await $.ui.mount({
      plugin: 'group-toggle',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /Midnight City/ })).toBeDefined()
    expect(await ui.find({ key: 'folder', label: '● Folder' } as never)).toBeDefined()

    await ui.press({ key: 'state' })
    expect(groupBy).toBe('state')

    const toggled = await $.command.run({ command: 'group', args: '' } as never)
    expect(String((toggled as { text?: string }).text)).toContain('folder')
    expect(groupBy).toBe('project')

    await $.command.run({ command: 'group', args: 'state' } as never)
    expect(groupBy).toBe('state')
    expect(calls).toContain('set_view state')
  })

  test('waits for the sidebar tools instead of warning when they connect late', async ($, on) => {
    const clock = mock.clock(on)
    let connected = false
    on('mcp.call', () => {
      if (!connected) throw new Error('no connected MCP tool "list_sections" on a server named "ccd_sidebar"')
      const text = JSON.stringify([{ id: 'sessions', group_by: 'state' }])
      return { value: { content: [{ type: 'text', text }], isError: false } }
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }))

    await $.session.start({ cwd: 'C:/work' } as never)
    await clock.settle()
    const ui = await $.ui.mount({
      plugin: 'group-toggle',
      surface: 'desktop',
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100 } as never,
    })
    expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeUndefined()

    connected = true
    await clock.advance(1000)
    expect(await ui.find({ key: 'state', label: '● State' } as never)).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /⚠/ })).toBeUndefined()
  })
})
