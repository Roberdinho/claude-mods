import type { JsonValue, Register } from 'claude-code'

import type { OmniCmd, OmniFrame } from '../types'
import { worldSvg } from './art'

const PANE = 'omnirealm'
const TITLE = 'OmniRealm'
const SAVE_KEY = 'world'

const frameRef = { plugin: 'omnirealm', key: 'frame' } as const
const cmdsRef = { plugin: 'omnirealm', key: 'cmds' } as const

/** Lines a row of desktop controls takes with the gap after it: a button is taller than a line of text. */
const BUTTON_ROW_LH = 2
/** The line under the toolbar saying what the tool does. */
const HINT_ROWS = 1
/** Lines kept below the map for the log or the inspected unit's card. */
const INFO_ROWS = 4
/** The column's gaps between its parts, half a line each, and a line to spare. */
const GAPS_LH = 3

/** Cells a label takes: wide for emoji and other pictographs, nothing for a variation selector. */
function cells(label: string): number {
  let n = 0
  for (const ch of label) {
    const c = ch.codePointAt(0) ?? 0
    if (c === 0xfe0f || c === 0x200d) continue
    n += c >= 0x1f000 || (c >= 0x2600 && c <= 0x27bf) || (c >= 0x2b00 && c <= 0x2bff) ? 2 : 1
  }
  return n
}

/** How many rows a wrapping row of buttons with these labels takes at this width. */
function buttonRows(labels: string[], cols: number): number {
  let rows = 1, x = 0
  for (const label of labels) {
    const w = cells(label) + 4
    if (x > 0 && x + w > cols) { rows++; x = 0 }
    x += w + 1
  }
  return rows
}

// Kept in step with the game's TOOLS in world.tsx.
const CATS: [string, string][] = [
  ['terrain', '⛰️ Terrain'], ['nature', '🌦️ Nature'], ['life', '🐑 Life'],
  ['destroy', '💣 Destroy'], ['magic', '✨ Magic'], ['inspect', '🔍 Inspect'],
]
const TOOLS: [string, string, string][] = [
  ['terrain', 'deep', '🌊 Ocean'], ['terrain', 'shallow', '💧 Shallows'], ['terrain', 'sand', '🏖️ Sand'],
  ['terrain', 'grass', '🌱 Grass'], ['terrain', 'forest', '🌲 Forest'], ['terrain', 'hills', '🟫 Hills'],
  ['terrain', 'mountain', '🏔️ Mountain'], ['terrain', 'desert', '🏜️ Desert'], ['terrain', 'tundra', '❄️ Tundra'],
  ['terrain', 'swamp', '🐸 Swamp'], ['terrain', 'enchanted', '🔮 Enchanted'], ['terrain', 'corrupt', '☠️ Corrupted'],
  ['terrain', 'heat', '🌡️ Heat'], ['terrain', 'cool', '🧊 Cool'],
  ['nature', 'rain', '🌧️ Rain'], ['nature', 'lightning', '⚡ Lightning'], ['nature', 'fire', '🔥 Fire'],
  ['nature', 'tornado', '🌪️ Tornado'], ['nature', 'quake', '〰️ Earthquake'], ['nature', 'volcano', '🌋 Volcano'],
  ['life', 'human', '🧑 Humans'], ['life', 'elf', '🧝 Elves'], ['life', 'orc', '👹 Orcs'], ['life', 'dwarf', '⛏️ Dwarves'],
  ['life', 'sheep', '🐑 Sheep'], ['life', 'chicken', '🐔 Chickens'], ['life', 'wolf', '🐺 Wolves'], ['life', 'bear', '🐻 Bears'],
  ['life', 'dragon', '🐉 Dragon'], ['life', 'demon', '😈 Demon'], ['life', 'ufo', '🛸 UFO'],
  ['destroy', 'dynamite', '🧨 Dynamite'], ['destroy', 'bomb', '💣 Bomb'], ['destroy', 'napalm', '🔥 Napalm'],
  ['destroy', 'atomic', '☢️ Atomic'], ['destroy', 'antimatter', '🕳️ Antimatter'],
  ['magic', 'plague', '🦠 Plague'], ['magic', 'zombie', '🧟 Zombies'], ['magic', 'madness', '🌀 Madness'],
  ['magic', 'heal', '💚 Healing'], ['magic', 'bless', '🙏 Blessing'], ['magic', 'curse', '💀 Curse'],
  ['inspect', 'inspect', '🔍 Inspect'], ['inspect', 'erase', '🧹 Remove life'],
]

/** What each tool does, shown under the toolbar while it is picked. */
const HINTS: Record<string, string> = {
  deep: 'Paint deep ocean. Floods houses; creatures that can\'t fly drown.',
  shallow: 'Paint shallow water. Floods houses.',
  sand: 'Paint sand beaches. Buildable, poor farmland.',
  grass: 'Paint grassland: the best farmland, where villages grow fastest.',
  forest: 'Plant forest: wood for building. Burns easily.',
  hills: 'Raise hills: stone for research. Dwarves love them.',
  mountain: 'Raise mountains: a wall only dwarves, bears and demons cross.',
  desert: 'Paint desert. Little food grows here.',
  tundra: 'Paint snowy tundra.',
  swamp: 'Paint swamp. Walkable, not buildable.',
  enchanted: 'Plant enchanted forest: creatures standing on it heal.',
  corrupt: 'Corrupt the land: it spreads, and demons crawl out of it.',
  heat: 'Heat up: melts ice and snow, dries land to desert, rock to lava.',
  cool: 'Cool down: freezes water, cools lava to rock, puts out fires.',
  rain: 'Rain: puts out fires, greens scorched land and desert, grows forests.',
  lightning: 'Lightning: strikes one spot, hurting creatures and setting fires.',
  fire: 'Start a fire: spreads through forest, grass and houses.',
  tornado: 'Tornado: wanders for a while, flinging creatures and wrecking houses.',
  quake: 'Earthquake: raises hills, opens rifts, shakes houses down.',
  volcano: 'Volcano: raises a mountain that pours lava for a while.',
  human: 'Place humans: they found or join a kingdom, farm and build.',
  elf: 'Place elves: long-lived, quick, gather wood without felling trees.',
  orc: 'Place orcs: tough, regenerate, and make enemies easily.',
  dwarf: 'Place dwarves: sturdy miners who can cross mountains.',
  sheep: 'Place sheep: they graze and breed on grass; prey for wolves.',
  chicken: 'Place chickens: they breed on grass; prey for wolves.',
  wolf: 'Place wolves: they hunt sheep, chickens and sometimes people.',
  bear: 'Place bears: strong hunters that attack anyone.',
  dragon: 'Place a dragon: flies anywhere and breathes fire on villages.',
  demon: 'Place a demon: sets fires and hunts people.',
  ufo: 'Place a UFO: it abducts creatures, then leaves for the stars.',
  dynamite: 'Dynamite: a small blast. Drag to blast a trail.',
  bomb: 'Bomb: a big blast that scorches the land.',
  napalm: 'Napalm: sets a wide area on fire.',
  atomic: 'Atomic bomb: destroys everything far around, leaving a crater.',
  antimatter: 'Antimatter: erases the land itself, leaving open ocean.',
  plague: 'Plague: infects creatures; it spreads, and can kill. Immune ones resist.',
  zombie: 'Zombies: turns people into zombies, or raises one; their bite spreads it.',
  madness: 'Madness: people attack anyone near them for a while.',
  heal: 'Healing: restores health and cures plague and madness.',
  bless: 'Blessing: gives each creature under the brush a good trait.',
  curse: 'Curse: gives each creature under the brush a bad trait.',
  inspect: 'Inspect: click a creature to see its stats and traits, and edit them.',
  erase: 'Remove life: removes every creature under the brush.',
}

/** The hint line: what the tool does, and how big it lands. */
function hintFor(tool: string, brush: number): string {
  const single = ['lightning', 'tornado', 'quake', 'volcano', 'dragon', 'demon', 'ufo', 'bomb', 'napalm', 'atomic', 'antimatter', 'inspect']
  const how = single.includes(tool) ? 'Click the map.' : `Click or drag on the map · brush ${brush}.`
  return `${HINTS[tool] ?? ''} ${how}  Keys after a click: arrows pan, space pauses.`
}

/** What the Client was last handed per surface, so a load answer keeps it. */
const lastProps: Record<string, { [k: string]: JsonValue }> = {}
/** The commands as last drawn; a press appends to these. */
let cmds: OmniCmd[] = []
let lastSeq = 0

type Message = { type: 'frame'; frame?: OmniFrame; save?: JsonValue; load?: boolean }

const isMessage = (data: unknown): data is Message =>
  typeof data === 'object' && data !== null && (data as Message).type === 'frame'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'omnirealm',
      description: 'Open OmniRealm, the god-simulator sandbox, in a side panel',
    })

    return next(e)
  })

  on('command.run', { command: 'omnirealm' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'OmniRealm opened. Click the map to give it the keys; Esc hands them back.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'terminal') {
      const { Box, Client } = $.ui.resolve(e)
      lastProps.terminal = {}

      return (
        <Box flexDirection="column" width="100%">
          <Client key="world" module="./world.tsx" width="100%" height={Math.max(16, e.props.scroll.bodyRows)} />
        </Box>
      )
    }
    if (e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>OmniRealm needs the terminal or the desktop app to draw its world.</Text>
    }

    // Desktop: the toolbar on top, where nothing below it can push it away;
    // then the map, a pixel-art picture with the game's input region laid
    // exactly over it, sized to leave room for everything else; then info.
    // Every button and dropdown is drawn by a Client of its own (see
    // controls.tsx): this pane redraws with each frame of the map, and a
    // Button it drew would lose its press to the next drawing.
    const { Box, Text, Svg, Client } = $.ui.resolve(e)
    const { value: frame } = await $.state.get(frameRef)
    cmds = (await $.state.get(cmdsRef)).value ?? []
    const hud = frame?.hud
    const info = frame?.info
    const cat = hud?.cat ?? 'life'
    const isRealms = hud?.view === 'realms' && frame !== undefined

    // The header names the tool, brush, speed and state these set.
    const speedNext = hud?.speed === 1 ? 2 : hud?.speed === 2 ? 4 : 1
    const toolbarButtons = [
      { key: 'pause', label: hud?.paused ? '▶ Play' : '❚❚ Pause', act: 'pause', active: hud?.paused === true },
      { key: 'speed', label: `⏩ Speed ${hud?.speed ?? 1}×`, act: `speed:${speedNext}` },
      { key: 'brush-down', label: '− Smaller', act: 'brush:-1' },
      { key: 'brush-up', label: '+ Bigger', act: 'brush:1' },
      { key: 'zoom', label: hud?.zoom === 1 ? '🔎 Zoom in' : '🔭 Zoom out', act: 'zoom' },
      { key: 'borders', label: '🗺️ Borders', act: 'borders', active: hud?.borders === true },
      { key: 'realms', label: '👑 Realms', act: 'realms', active: isRealms },
      { key: 'save', label: '💾 Save', act: 'save' },
      { key: 'load', label: '📂 Load', act: 'load' },
      { key: 'new', label: '🌍 New world', act: 'new' },
    ]
    const toolOptions = TOOLS.filter(([c]) => c === cat).map(([, id, label]) => ({ value: id, label }))
    const toolbarProps = {
      selects: [
        { key: 'cat', value: cat, act: 'cat', options: CATS.map(([value, label]) => ({ value, label })) },
        { key: 'tool', value: hud?.tool ?? '', act: 'tool', options: toolOptions },
      ],
      buttons: toolbarButtons,
    }
    const catLabel = CATS.find(([id]) => id === cat)?.[1] ?? ''
    const toolLabel = toolOptions.find(o => o.value === hud?.tool)?.label ?? ''

    // Room the map may take: the pane less the header, the toolbar's rows as
    // they wrap at this width, the info below and the gaps.
    const cols = Math.max(20, e.props.bodyColumns)
    const toolbarRows = buttonRows([`${catLabel} ▾`, `${toolLabel} ▾`, ...toolbarButtons.map(s => s.label)], cols)
    const realmRows = isRealms ? Math.min(frame.realms.length, 8) + 2 + frame.log.length : 0
    const chrome = 1 + toolbarRows * BUTTON_ROW_LH + HINT_ROWS + INFO_ROWS + realmRows + GAPS_LH
    const availRows = Math.max(8, e.props.scroll.bodyRows - chrome)
    const props = { desktop: true, availRows, cmds }
    lastProps.desktop = props


    const header = hud === undefined
      ? <Text dimColor>Shaping the world…</Text>
      : (
        <Text wrap="truncate-end">
          <Text bold color="#ffd23f">OmniRealm</Text>
          <Text dimColor>{`  Year ${hud.year} · ${hud.pop} people · ${hud.kingdoms} kingdoms${hud.wars > 0 ? ` · ${hud.wars} at war` : ''} · ${hud.beasts} beasts  `}</Text>
          <Text bold color="#74c0fc">{`${hud.toolLabel}${hud.cat !== 'inspect' && hud.tool !== 'lightning' ? ` · brush ${hud.brush}` : ''}`}</Text>
          <Text color={hud.paused ? '#ffa94d' : '#8ce99a'}>{hud.paused ? '  ❚❚ paused' : `  ▶ ${hud.speed}×`}</Text>
        </Text>
      )

    const toolbar = (
      <Box flexDirection="column">
        <Client key="toolbar" module="./controls.tsx" props={toolbarProps} />
        <Box key="hint"><Text dimColor wrap="truncate-end">{hud === undefined ? ' ' : hintFor(hud.tool, hud.brush)}</Text></Box>
      </Box>
    )

    const realms = isRealms
      ? (
        <Box flexDirection="column">
          <Text bold>{`Realms of the world (${frame.realms.length})`}</Text>
          {frame.realms.length === 0 && <Text dimColor>No kingdoms yet: drop humans, elves, orcs or dwarves on land.</Text>}
          {frame.realms.slice(0, 8).map(r => (
            <Text key={`realm-${r.name}`} wrap="truncate-end">
              <Text color={r.color}>■ </Text>
              <Text bold color={r.color}>{r.name}</Text>
              <Text dimColor>{` ${r.text}`}</Text>
              {r.wars ? <Text color="#ff8787">{` · ⚔ ${r.wars}`}</Text> : null}
              {r.allies ? <Text color="#8ce99a">{` · ♥ ${r.allies}`}</Text> : null}
            </Text>
          ))}
          <Text bold>Chronicle</Text>
          {frame.log.map((line, n) => <Text key={`chron-${n}`} dimColor wrap="truncate-end">{line}</Text>)}
        </Box>
      )
      : null

    // The map's box is the pane's width by `availRows` rows: the picture is
    // stretched over it (a flex row stretches its height; it fills its box),
    // and the game's region, as wide as the pane, draws itself that many rows
    // tall over the same box, so a click's cell maps straight to a tile. The
    // desktop sizes a Client by what it draws, never by a percentage height.
    const map = (
      <Box key="map" position="relative" width="100%">
        <Box flexDirection="row" width="100%" height={availRows}>
          {frame !== undefined
            ? <Svg source={worldSvg(frame)} alt={`OmniRealm world map, year ${frame.hud.year}`} />
            : <Text dimColor> </Text>}
        </Box>
        <Box position="absolute" top={0} left={0} width="100%" flexDirection="column">
          <Client key="world" module="./world.tsx" props={props} />
        </Box>
      </Box>
    )

    const card = info?.kind === 'unit'
      ? {
        label: info.traits.length > 0 ? 'Traits (click to remove):' : 'No traits',
        buttons: [
          ...info.traits.map(t => ({ key: `trait-${t.name}`, label: `${t.good ? '✦' : '✧'} ${t.name.replace('_', ' ')} ✕`, act: `untrait:${t.name}` })),
          ...(info.canTrait ? [{ key: 'trait-add', label: '＋ Random trait', act: 'trait' }] : []),
          { key: 'follow', label: info.follow ? '📍 Stop following' : '📍 Follow', act: 'follow', active: info.follow },
          { key: 'smite', label: '⚡ Smite', act: 'smite' },
          { key: 'close', label: '✕ Close', act: 'close' },
        ],
      }
      : undefined
    const details = info?.kind === 'unit' && card !== undefined
      ? (
        <Box flexDirection="column" rowGap={1}>
          <Text wrap="truncate-end">
            <Text bold color={info.color}>{info.name}</Text>
            <Text dimColor>{`  ${info.line}`}</Text>
          </Text>
          <Client key="card" module="./controls.tsx" props={card} />
        </Box>
      )
      : isRealms
        ? null
        : (
          <Box flexDirection="column">
            {(frame?.log ?? []).map((line, n) => <Text key={`log-${n}`} dimColor={n > 0} wrap="truncate-end">{line}</Text>)}
          </Box>
        )

    return (
      <Box flexDirection="column" width="100%" rowGap={1}>
        {header}
        {toolbar}
        {realms}
        {map}
        {details}
      </Box>
    )
  })

  // The game posts each frame and its saves; the controls their commands,
  // handed on to the game through its props.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { type?: string; act?: string } | null
    if (data?.type === 'cmd' && typeof data.act === 'string') {
      lastSeq = Math.max(lastSeq + 1, Date.now())
      cmds = [...cmds, { seq: lastSeq, act: data.act }].slice(-16)
      await $.state.set(cmdsRef, cmds)

      return {}
    }
    if (e.element !== 'world' || !isMessage(e.data)) return next(e)
    const msg = e.data
    if (msg.save !== undefined) {
      await $.store.set(SAVE_KEY, msg.save)
      $.ui.toast('OmniRealm: world saved')
    }
    if (msg.frame !== undefined) await $.state.set(frameRef, msg.frame)
    if (msg.load === true) {
      const world = await $.store.get(SAVE_KEY)
      if (world === undefined) {
        $.ui.toast('OmniRealm: no saved world yet')

        return {}
      }

      return { props: { ...(lastProps[e.surface] ?? {}), load: world as JsonValue, nonce: Date.now() } }
    }

    return {}
  })
}
