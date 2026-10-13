import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Grouping } from '../types'

const SIDEBAR = 'ccd_sidebar'
const grouping = atom({ plugin: 'group-toggle', key: 'grouping' } as const, null as Grouping)
const lastError = atom({ plugin: 'group-toggle', key: 'lastError' } as const, null as string | null)

function textOf(content: { type: string; text?: string }[]) {
  return content.map(block => (block.type === 'text' ? block.text ?? '' : '')).join('')
}

async function refresh($: EngineInterface) {
  try {
    const result = await $.mcp.call(SIDEBAR, 'list_sections')
    if (result.isError) {
      await update($, lastError, () => textOf(result.content))
      return
    }
    await update($, lastError, () => null)
    const sections = JSON.parse(textOf(result.content)) as { id: string; group_by: string }[]
    const by = sections.find(section => section.id === 'sessions')?.group_by
    const now: Grouping = by === 'project' || by === 'state' ? by : 'other'
    await update($, grouping, () => now)
  } catch (error) {
    await update($, lastError, () => String(error))
  }
}

async function setGrouping($: EngineInterface, to: 'project' | 'state') {
  let result
  try {
    result = await $.mcp.call(SIDEBAR, 'set_view', { group_by: to })
  } catch (error) {
    await update($, lastError, () => String(error))
    $.ui.toast(`Sidebar not changed: ${String(error)}`)
    return false
  }
  if (result.isError) {
    $.ui.toast(`Sidebar not changed: ${textOf(result.content)}`)
    return false
  }
  await update($, grouping, () => to)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'group',
      description: 'Group the sidebar by folder or state (no argument toggles)',
      argumentHint: '[folder|state]',
    })
    void refresh($)
    return next(e)
  })

  on('command.run', { command: 'group' }, async ($, e) => {
    await refresh($)
    const arg = e.args.trim().toLowerCase()
    const to: 'project' | 'state' =
      arg.startsWith('f') || arg.startsWith('p') ? 'project'
      : arg.startsWith('s') ? 'state'
      : (await read($, grouping)) === 'project' ? 'state' : 'project'
    const ok = await setGrouping($, to)
    return { text: ok ? `Sidebar grouped by ${to === 'project' ? 'folder' : 'state'}.` : 'Sidebar not changed.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await read($, grouping)
    const error = await read($, lastError)
    if (e.props.hasSurvey) return next(e)

    // Stack under whatever the other mods draw here (a music band, ...), never replace it.
    const below = await next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
      {below}
      <Box>
        <Text dimColor>Group sidebar: </Text>
        <Button
          key="folder"
          label={now === 'project' ? '● Folder' : '○ Folder'}
          dimColor={now !== 'project'}
          onPress={() => setGrouping($, 'project')}
        />
        <Text> </Text>
        <Button
          key="state"
          label={now === 'state' ? '● State' : '○ State'}
          dimColor={now !== 'state'}
          onPress={() => setGrouping($, 'state')}
        />
        {error !== null && <Text dimColor> ⚠ {error.slice(0, 120)}</Text>}
      </Box>
      </Box>
    )
  })
}
