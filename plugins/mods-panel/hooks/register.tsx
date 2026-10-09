import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { commandLabel, findInstalls, groupMods, hotkey, needsArgs, promptText, uninstallArgv } from './mods'
import type { ModCommand } from './mods'

const PANE = 'mods-panel'
const SELF = 'mods-panel'
const selected = atom({ plugin: 'mods-panel', key: 'selected' } as const, null)
const hints = atom({ plugin: 'mods-panel', key: 'hints' } as const, {})
const confirming = atom({ plugin: 'mods-panel', key: 'confirming' } as const, null)
const uninstalling = atom({ plugin: 'mods-panel', key: 'uninstalling' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mods',
      description: 'Show installed mods and their commands in a side panel',
      argumentHint: '[mod]',
    })
    // Have the engine list every command again, so the describe hook below
    // learns which ones take arguments.
    $.ui.invalidate('command.describe')

    return next(e)
  })

  on('command.describe', async ($, e, next) => {
    const result = await next(e)
    const hint = result.argumentHint?.trim() || null
    const known = await read($, hints)
    if (known[e.command] !== hint) {
      await update($, hints, all => ({ ...all, [e.command]: hint }))
    }

    return result
  })

  on('command.run', { command: 'mods' }, async ($, e) => {
    const wanted = e.args.trim()
    await update($, selected, () => (wanted === '' ? null : wanted))
    await update($, confirming, () => null)
    await $.ui.open({ id: PANE, title: 'Mods', focus: true, closeOnEscape: true })

    return { text: wanted === '' ? 'Mods panel opened.' : `Mods panel opened on ${wanted}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const mods = groupMods(await $.command.list(), await read($, hints), SELF)
    const current = await read($, selected)
    const mod = current === null ? undefined : mods.find(m => m.name === current)
    const asking = await read($, confirming)
    const busy = await read($, uninstalling)

    const pick = async (command: ModCommand) => {
      if (needsArgs(command)) {
        const { isFilled } = await $.prompt.fill({ text: promptText(command) })
        if (isFilled) {
          await $.ui.close({ id: PANE })
        } else {
          $.ui.toast(`Could not fill the prompt; type ${promptText(command)}yourself`)
        }

        return
      }
      $.ui.toast(`Running /${command.name}`)
      $.command.run({ command: command.name }).catch((err: unknown) => {
        $.ui.toast(`/${command.name} failed: ${err instanceof Error ? err.message : String(err)}`)
      })
    }

    const uninstall = async (name: string) => {
      await update($, confirming, () => null)
      await update($, uninstalling, () => name)
      try {
        const list = await $.process.run(['claude', 'plugin', 'list', '--json'])
        const installs = findInstalls(list.stdout, name)
        if (installs.length === 0) {
          $.ui.toast(`${name} is not installed from a marketplace (loaded with --plugin-dir?); nothing to uninstall`)
          return
        }
        const failed: string[] = []
        for (const install of installs) {
          const { exitCode, stderr, stdout } = await $.process.run(uninstallArgv(install))
          if (exitCode !== 0) failed.push(`${install.id}: ${(stderr || stdout).trim() || `exit ${exitCode}`}`)
        }
        if (failed.length > 0) {
          $.ui.toast(`Could not uninstall ${failed.join('; ')}`)
          return
        }
        await update($, selected, () => null)
        $.ui.toast(`Uninstalled ${name}; it stays loaded until the session restarts`)
      } catch (err: unknown) {
        $.ui.toast(`Uninstalling ${name} failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        await update($, uninstalling, () => null)
      }
    }

    if (mod === undefined) {
      return (
        <Box flexDirection="column">
          <Text bold>Installed mods ({mods.length})</Text>
          {current !== null && <Text dimColor>No mod named {current} has commands.</Text>}
          {mods.length === 0 && <Text dimColor>No mods with commands are installed.</Text>}
          {mods.map((m, i) => (
            <Button
              key={`mod:${m.name}`}
              label={`${m.name}  (${m.commands.length})`}
              hotkey={hotkey(i)}
              plain
              onPress={() => update($, selected, () => m.name)}
            />
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Button
            key="back"
            label="< Mods"
            hotkey="b"
            plain
            onPress={async () => {
              await update($, confirming, () => null)
              await update($, selected, () => null)
            }}
          />
          <Text bold> {mod.name}</Text>
        </Box>
        {busy === mod.name ? (
          <Text dimColor>Uninstalling {mod.name}…</Text>
        ) : asking === mod.name ? (
          <Box>
            <Text>Uninstall {mod.name}? </Text>
            <Button key="yes" label="Yes, uninstall" hotkey="y" variant="primary" onPress={() => uninstall(mod.name)} />
            <Button key="no" label="Cancel" hotkey="n" plain onPress={() => update($, confirming, () => null)} />
          </Box>
        ) : (
          <Button key="uninstall" label="Uninstall mod" hotkey="u" plain onPress={() => update($, confirming, () => mod.name)} />
        )}
        <Text dimColor>Runs at once, or fills the prompt when it takes arguments.</Text>
        {mod.commands.map((c, i) => (
          <Box key={`row:${c.name}`} flexDirection="column">
            <Button
              key={`cmd:${c.name}`}
              label={commandLabel(c)}
              hotkey={hotkey(i)}
              plain
              variant={needsArgs(c) ? 'secondary' : 'primary'}
              onPress={() => pick(c)}
            />
            {c.description !== '' && <Text dimColor>{`    ${c.description}`}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
