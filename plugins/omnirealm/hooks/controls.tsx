import type { ClientModule, JsonValue } from 'claude-code'

/*
 * The desktop's buttons and dropdowns. They live in a Client of their own so
 * their handlers stay put: the pane around them redraws with every frame of
 * the map, and a Button drawn by the pane would lose its press to the next
 * drawing. This region redraws only when its own props change. A press posts
 * the command; the hooks module hands it on to the game.
 */

type Choice = { key: string; value: string; act: string; options: { value: string; label: string }[] }
type Press = { key: string; label: string; act: string; active?: boolean }
export type ControlsProps = { label?: string; selects?: Choice[]; buttons: Press[] }

const Controls: ClientModule<JsonValue> = (props, s) => {
  const { Box, Text, Button, Select } = s.elements
  const p = (props ?? { buttons: [] }) as unknown as ControlsProps
  const send = (act: string) => s.post({ type: 'cmd', act })

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
      {p.label !== undefined ? <Text dimColor>{p.label}</Text> : null}
      {(p.selects ?? []).map(c => (
        <Select key={c.key} value={c.value} options={c.options} onSelect={v => send(`${c.act}:${v}`)} />
      ))}
      {p.buttons.map(b => (
        <Button key={b.key} variant={b.active === true ? 'primary' : 'secondary'} onPress={() => send(b.act)}>{b.label}</Button>
      ))}
    </Box>
  )
}

export default Controls
