import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { EmoteEvent, Pose, Rarity, Save, Tab } from '../types'
import { ANCHORS, HAT_PLACE } from './anchors'
import {
  ACHIEVEMENTS,
  BEASTS,
  CHEST_MINUTES,
  CHEST_PRICE,
  EGG_MINUTES,
  EMOTE_MS,
  EMOTE_TRIGGERS,
  EXCHANGE_COUNT,
  ITEMS,
  POINTS,
  RARITIES,
  RARITY_LABEL,
  SLEEP_AFTER_MS,
  TUTORIAL,
  beastById,
} from './data'
import {
  buyBeast,
  buyChest,
  checkAchievements,
  chooseStarter,
  emoteFor,
  exchange,
  migrate,
  newSave,
  openChest,
  promptTaps,
  recordPrompt,
  recordToolCall,
  recordTurn,
  setActive,
  spareOf,
  tickClock,
  toggleEquip,
} from './game'
import type { Result } from './game'

const PANE = 'keybeasts'
const TITLE = 'Keybeasts'
const STORE_KEY = 'save'

// Verander de tag als de vorm van een waarde verandert: dan wordt wat een oudere versie bewaarde genegeerd.
const saveAtom = atom({ plugin: 'keybeasts', key: 'save' } as const, null, { shape: 'save-2' })
const poseAtom = atom({ plugin: 'keybeasts', key: 'pose' } as const, 'idle', { shape: 'pose-1' })
const tabAtom = atom({ plugin: 'keybeasts', key: 'tab' } as const, 'beest', { shape: 'tab-1' })
const noticeAtom = atom({ plugin: 'keybeasts', key: 'notice' } as const, '', { shape: 'notice-1' })
const emoteAtom = atom({ plugin: 'keybeasts', key: 'emote' } as const, '', { shape: 'emote-1' })

type $ = EngineInterface

const rng = (): number => {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0]! / 4294967296
}

// ---------- opslag en mutaties ----------

// De save staat in $.store: één bestand dat alle sessies delen. $.state is alleen een kopie
// voor het tekenen. Elke actie leest daarom eerst de verse save uit de store, zodat sessies
// elkaars voortgang niet overschrijven.

/** Haalt de gedeelde save op en zet hem in de teken-kopie. */
const loadSave = async ($: $): Promise<Save> => {
  const stored = migrate(await $.store.get(STORE_KEY))
  await update($, saveAtom, () => stored)
  return stored
}

// Acties binnen één sessie na elkaar uitvoeren, zodat lezen-wijzigen-schrijven niet door elkaar loopt.
let queue: Promise<unknown> = Promise.resolve()

const statusLine = (s: Save): string | undefined =>
  s.owned.length === 0 ? undefined : `⌨ ${s.keys} · 🎁 ${s.chests}${s.eggs.length ? ` · 🥚 ${s.eggs.length}` : ''}`

/** Past een spelactie toe, bewaart het resultaat en meldt wat er gebeurde. */
const apply = ($: $, change: (s: Save) => Result | Save, opts: { toast?: boolean } = {}): Promise<Result> => {
  const run = queue.then(() => applyNow($, change, opts))
  queue = run.catch(() => undefined)
  return run
}

const NOTICE_MS = 12_000
let noticeTimer: { cancel: () => void } | undefined

/** Toont een melding in het paneel en haalt hem na een tijdje weer weg, zodat er geen oude regel blijft staan. */
const notify = async ($: $, message: string) => {
  noticeTimer?.cancel()
  await update($, noticeAtom, () => message)
  noticeTimer = $.clock.after(NOTICE_MS, () => void update($, noticeAtom, () => ''))
}

const applyNow = async ($: $, change: (s: Save) => Result | Save, opts: { toast?: boolean }): Promise<Result> => {
  const fresh = migrate(await $.store.get(STORE_KEY))
  const r = change(fresh)
  const res: Result = 'save' in r ? r : { save: r }
  const a = checkAchievements(res.save)
  const unlocked = a.unlocked
  const out: Result = { ...res, save: a.save }
  if (out.save !== fresh) await $.store.set(STORE_KEY, out.save)
  await update($, saveAtom, () => out.save)
  $.ui.status(statusLine(out.save))
  const message = out.error ?? out.note
  if (message) await notify($, message)
  if (out.note && opts.toast) $.ui.toast(out.note)
  for (const name of unlocked) $.ui.toast(`🏆 Prestatie: ${name}`)
  return out
}

// ---------- animatie ----------

let drumTimer: { cancel: () => void } | undefined
let emoteTimer: { cancel: () => void } | undefined
let okStreak = 0 // gelukte tool-calls op rij in deze sessie (voor Vuur)

/** Laat de emote die bij deze gebeurtenis hoort even zien, als je hem bezit en hij aan staat. */
const react = async ($: $, s: Save, event: EmoteEvent, streak = 0) => {
  const id = emoteFor(s, event, streak)
  if (!id) return
  emoteTimer?.cancel()
  await update($, emoteAtom, () => id)
  emoteTimer = $.clock.after(EMOTE_MS, () => void update($, emoteAtom, () => ''))
}
let frameTimers: { cancel: () => void }[] = []
let lastEventAt = 0

const setPose = (_$: $, pose: Pose) => update(_$, poseAtom, () => pose)

const play = ($: $, frames: Pose[], stepMs: number, end: Pose) => {
  for (const t of frameTimers) t.cancel()
  frameTimers = frames.map((pose, i) => $.clock.after(i * stepMs + 1, () => void setPose($, pose)))
  frameTimers.push($.clock.after(frames.length * stepMs + 1, () => void setPose($, drumTimer ? 'links' : end)))
}

const taps = (n: number): Pose[] => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'links' : 'rechts'))

const markActive = ($: $) => {
  void $.clock.now().then(now => (lastEventAt = now))
}

// ---------- tekenen ----------

const fileCache = new Map<string, string>()

const asset = async ($: $, rel: string): Promise<string | undefined> => {
  const hit = fileCache.get(rel)
  if (hit) return hit
  try {
    const { base64 } = await $.fs.read(`${$.plugin.root}/${rel}`, { as: 'bytes' })
    fileCache.set(rel, base64)
    return base64
  } catch {
    return undefined
  }
}

const img = (b64: string | undefined, x: number, y: number, w: number, h: number) =>
  b64
    ? `<image href="data:image/png;base64,${b64}" xlink:href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}"/>`
    : ''

/** Het beestje als gelaagde SVG: lichaam, instrument, hoed en emote. */
const beastSvg = async ($: $, s: Save, beastId: string, pose: Pose, withGear: boolean, emote = ''): Promise<string> => {
  const body = await asset($, `assets/beasts/${beastId}/${pose}.png`)
  const layers = [body ? img(body, 0, 0, 160, 160) : `<text x="80" y="90" font-size="48" text-anchor="middle">🐾</text>`]
  if (withGear) {
    const gear = s.equipped[beastId] ?? {}
    const anchor = ANCHORS[beastId] ?? beastById(beastId)?.hat ?? { x: 80, y: 46, w: 70 }
    if (gear.instrument) layers.push(img(await asset($, `assets/items/${gear.instrument}.png`), 118, 52, 42, 42))
    if (gear.hoed) {
      // HAT_PLACE (gemaakt door tools/process_art.py) zegt per beestje per hoed waar de sprite komt.
      const place = HAT_PLACE[beastId]?.[gear.hoed]
      const w = place?.w ?? anchor.w
      const x = place?.x ?? anchor.x - w / 2
      const y = place?.y ?? anchor.y - w * 0.88
      layers.push(img(await asset($, `assets/items/${gear.hoed}.png`), x, y, w, w))
    }
    if (emote) layers.push(img(await asset($, `assets/items/${emote}.png`), 2, 2, 44, 44))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 160 160" width="160" height="160">${layers.join('')}</svg>`
}

const Picture = async ($: $, e: RenderInput, s: Save, beastId: string, pose: Pose, size: number, withGear = true, emote = '') => {
  const name = beastById(beastId)?.name ?? beastId
  if (e.surface === 'terminal') {
    const { Image, Text } = $.ui.resolve(e)
    const body = await asset($, `assets/beasts/${beastId}/${pose}.png`)
    if (!body) return <Text>🐾 {name}</Text>
    const cols = Math.max(8, Math.round(size / 8))
    return <Image key={`beast-${beastId}`} source={{ png: body }} columns={cols} rows={Math.round(cols / 2)} alt={name} />
  }
  const { Svg } = $.ui.resolve(e)
  return <Svg source={await beastSvg($, s, beastId, pose, withGear, emote)} alt={name} width={size} height={size} />
}

/** Eén item-plaatje (kist, ei, hoed...). */
const Icon = async ($: $, e: RenderInput, id: string, size: number, alt: string, key = id) => {
  const png = await asset($, `assets/items/${id}.png`)
  if (e.surface === 'terminal') {
    const { Image, Text } = $.ui.resolve(e)
    if (!png) return <Text>{alt}</Text>
    const cols = Math.max(4, Math.round(size / 8))
    return <Image key={`icon-${key}`} source={{ png }} columns={cols} rows={Math.round(cols / 2)} alt={alt} />
  }
  const { Svg } = $.ui.resolve(e)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 96 96" width="96" height="96">${img(png, 0, 0, 96, 96)}</svg>`
  return <Svg source={svg} alt={alt} width={size} height={size} />
}

const bar = (value: number, max: number, width = 12): string => {
  const n = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return '▓'.repeat(n) + '░'.repeat(width - n)
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'beest', label: 'Beest' },
  { id: 'kisten', label: 'Kisten' },
  { id: 'spullen', label: 'Spullen' },
  { id: 'winkel', label: 'Winkel' },
  { id: 'prestaties', label: 'Prestaties' },
]

const HELP = [
  'Keybeasts-opties:',
  '  /keybeasts            open het paneel',
  '  /keybeasts tutorial   start de tutorial opnieuw (ook: /keybeasts-tutorial)',
  '  /keybeasts help       toon deze lijst',
].join('\n')

const restartTutorial = async ($: $) => {
  await apply($, s => ({ ...s, tutorialStep: 0 }))
  await $.ui.open({ id: PANE, title: TITLE })
  return { text: 'De Keybeasts-tutorial start opnieuw in het paneel.' }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'keybeasts', description: 'Open het Keybeasts-paneel', argumentHint: '[tutorial | help]' })
    // Een melding uit een vorige sessie (bv. 'Gewoon: Bandana!') hoort er na een herstart niet meer te staan.
    await update($, noticeAtom, () => '')
    await $.command.register({ name: 'keybeasts-tutorial', description: 'Start de Keybeasts-tutorial opnieuw' })
    const s = await loadSave($)
    $.ui.status(statusLine(s))
    lastEventAt = s.lastEventAt
    void $.ui.open({ id: PANE, title: TITLE })

    // Elke minuut: actieve tijd tellen (kisten, eieren) en slapen na 5 minuten stilte.
    // Elke sessie tikt, maar per klokminuut telt alleen de eerste (lastTickMinute in de gedeelde save).
    // Dezelfde tik haalt ook wijzigingen uit andere sessies op voor het paneel.
    $.clock.every(60_000, async () => {
      const now = await $.clock.now()
      const r = await apply(
        $,
        s => tickClock(s, now, lastEventAt, rng),
        { toast: true },
      )
      const latest = Math.max(r.save.lastEventAt, lastEventAt)
      if (now - latest > SLEEP_AFTER_MS && !drumTimer) {
        if ((await read($, poseAtom)) !== 'slapen') await react($, r.save, 'slapen')
        await setPose($, 'slapen')
      }
    })

    return next(e)
  })

  on('command.run', { command: 'keybeasts-tutorial' }, async $ => restartTutorial($))

  on('command.run', { command: 'keybeasts' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'tutorial') return restartTutorial($)
    if (arg === 'help' || arg === '?') return { text: HELP }
    await $.ui.open({ id: PANE, title: TITLE })
    if (arg !== '') return { text: `Onbekende optie "${arg}".\n${HELP}` }
    return { text: 'Keybeasts-paneel geopend.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!e.command && e.text.trim()) {
      const n = promptTaps(e.text)
      const now = await $.clock.now()
      lastEventAt = now
      await apply($, s => (s.owned.length ? recordPrompt(s, n * POINTS.promptTap, now) : s))
      play($, taps(n), 140, 'idle')
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      markActive($)
      drumTimer?.cancel()
      let left = true
      drumTimer = $.clock.every(380, () => {
        left = !left
        void setPose($, left ? 'links' : 'rechts')
      })
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      drumTimer?.cancel()
      drumTimer = undefined
      const now = await $.clock.now()
      lastEventAt = now
      const r = await apply($, s => (s.owned.length ? recordTurn(s, POINTS.turn, now) : s))
      play($, ['beide', 'klaar', 'klaar', 'klaar'], 400, 'idle')
      await react($, r.save, 'beurt')
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    markActive($)
    void setPose($, 'beide')
    const ran = await next(e)
    const failed = 'deny' in ran && typeof ran.deny === 'string' ? true : ran.isError === true
    const now = await $.clock.now()
    const r = await apply($, s => (s.owned.length ? recordToolCall(s, POINTS.toolCall, now) : s))
    play($, [failed ? 'boos' : 'klaar', failed ? 'boos' : 'klaar'], 350, 'idle')
    okStreak = failed ? 0 : okStreak + 1
    await react($, r.save, failed ? 'tool-fout' : 'tool-ok', okStreak)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = (await read($, saveAtom)) ?? newSave()
    const pose = await read($, poseAtom)
    const emote = await read($, emoteAtom)
    const tab = await read($, tabAtom)
    const notice = await read($, noticeAtom)
    const go = (t: Tab) => () => {
      noticeTimer?.cancel()
      void update($, noticeAtom, () => '')
      void update($, tabAtom, () => t)
    }

    // Eerste start: starter kiezen.
    if (s.owned.length === 0) {
      const starters = BEASTS.filter(b => b.isStarter)
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Kies je eerste Keybeast!</Text>
          <Text dimColor>Je beestje trommelt mee op jouw prompts en Claude's tool-calls. Andere beestjes speel je later vrij.</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {await Promise.all(
              starters.map(async b => (
                <Box key={`starter-${b.id}`} flexDirection="column" alignItems="center">
                  {await Picture($, e, s, b.id, 'idle', 96, false)}
                  <Button key={`kies-${b.id}`} label={`Kies ${b.name}`} onPress={() => void apply($, x => chooseStarter(x, b.id))} />
                </Box>
              )),
            )}
          </Box>
        </Box>
      )
    }

    const active = s.active ?? s.owned[0]!
    const beast = beastById(active)
    const tutorialOpen = s.tutorialStep >= 0 && s.tutorialStep < TUTORIAL.length

    let body
    if (tab === 'beest') {
      body = (
        <Box flexDirection="column" gap={1}>
          <Text bold>Jouw beestjes</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {s.owned.map(id => (
              <Button key={`wissel-${id}`} label={`${id === active ? '● ' : ''}${beastById(id)?.name ?? id}`} onPress={() => void apply($, x => setActive(x, id))} />
            ))}
          </Box>
          {s.eggs.length > 0 && <Text bold>Eieren</Text>}
          {await Promise.all(
            s.eggs.map(async (egg, i) => (
              <Box key={`ei-${egg.id}`} flexDirection="row" alignItems="center" columnGap={1}>
                {await Icon($, e, egg.progress >= EGG_MINUTES / 2 ? 'ei-barst' : 'ei', 40, 'Ei', egg.id)}
                <Text>Ei {i + 1}: {bar(egg.progress, EGG_MINUTES)} {egg.progress}/{EGG_MINUTES} min</Text>
              </Box>
            )),
          )}
        </Box>
      )
    } else if (tab === 'kisten') {
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" alignItems="center" columnGap={1}>
            {await Icon($, e, s.chests > 0 ? 'kist-dicht' : 'kist-open', 64, 'Kist')}
            <Text>🎁 Kisten: <Text bold>{s.chests}</Text></Text>
          </Box>
          <Text dimColor>Volgende kist: {bar(s.chestProgress, CHEST_MINUTES)} {s.chestProgress}/{CHEST_MINUTES} actieve min</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            <Button key="open-kist" label="Open kist" onPress={() => void apply($, x => openChest(x, rng), { toast: true })} />
            <Button key="koop-kist" label={`Koop kist (${CHEST_PRICE} ⌨)`} onPress={() => void apply($, buyChest)} />
          </Box>
        </Box>
      )
    } else if (tab === 'spullen') {
      const gear = s.equipped[active] ?? {}
      const owned = ITEMS.filter(i => (s.inventory[i.id] ?? 0) > 0)
      body = (
        <Box flexDirection="column" gap={1}>
          {owned.length === 0 && <Text dimColor>Nog geen spullen. Open een kist!</Text>}
          {(['hoed', 'instrument', 'emote'] as const).map(slot => {
            const list = owned.filter(i => i.slot === slot)
            if (list.length === 0) return null
            return (
              <Box key={`slot-${slot}`} flexDirection="column">
                <Text bold>{slot === 'hoed' ? 'Hoeden' : slot === 'instrument' ? 'Instrumenten' : 'Emotes (reageren vanzelf)'}</Text>
                <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                  {list.map(i => (
                    <Button
                      key={`item-${i.id}`}
                      label={
                        slot === 'emote'
                          ? `${s.emotesOff.includes(i.id) ? '○' : '✓'} ${i.name}: ${EMOTE_TRIGGERS[i.id]?.text ?? ''}`
                          : `${gear[slot] === i.id ? '✓ ' : ''}${i.name} ×${s.inventory[i.id]} · ${RARITY_LABEL[i.rarity]}`
                      }
                      onPress={() => void apply($, x => toggleEquip(x, i.id))}
                    />
                  ))}
                </Box>
              </Box>
            )
          })}
          <Text bold>Ruilen ({EXCHANGE_COUNT} → 1 betere)</Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
            {RARITIES.slice(0, -1).map((r: Rarity) => {
              const spare = spareOf(s, r).reduce((n, x) => n + x.spare, 0)
              return (
                <Button
                  key={`ruil-${r}`}
                  label={`${RARITY_LABEL[r]} ${spare}/${EXCHANGE_COUNT}`}
                  dimColor={spare < EXCHANGE_COUNT}
                  onPress={() => void apply($, x => exchange(x, r, rng), { toast: true })}
                />
              )
            })}
          </Box>
        </Box>
      )
    } else if (tab === 'winkel') {
      const forSale = BEASTS.filter(b => !s.owned.includes(b.id))
      body = (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>Je hebt ⌨ {s.keys} keys.</Text>
          {forSale.length === 0 && <Text>Je hebt alle beestjes! 🎉</Text>}
          {forSale.map(b =>
            b.price === null ? (
              <Text key={`koop-${b.id}`} dimColor>{b.name}: alleen uit een 🥚 ei</Text>
            ) : (
              <Button
                key={`koop-${b.id}`}
                label={`Koop ${b.name} (${b.price} ⌨)`}
                dimColor={s.keys < b.price}
                onPress={() => void apply($, x => buyBeast(x, b.id), { toast: true })}
              />
            ),
          )}
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column">
          {ACHIEVEMENTS.map(a => (
            <Text key={`ach-${a.id}`} dimColor={!s.achievements.includes(a.id)}>
              {s.achievements.includes(a.id) ? '🏆' : '·'} {a.name}: {a.text}
            </Text>
          ))}
          <Text dimColor>
            {'\n'}Tool-calls {s.stats.toolCalls} · prompts {s.stats.prompts} · beurten {s.stats.turns} · kisten {s.stats.chestsOpened} · actief {s.stats.activeMinutes} min
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
          {await Picture($, e, s, active, pose, 160, true, emote)}
          <Box flexDirection="column">
            <Text bold>{beast?.name ?? active}</Text>
            <Text>⌨ {s.keys}</Text>
            <Text>🎁 {s.chests}{s.eggs.length ? `  🥚 ${s.eggs.length}` : ''}</Text>
          </Box>
        </Box>
        {tutorialOpen && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text>💡 {TUTORIAL[s.tutorialStep]}</Text>
            <Box flexDirection="row" columnGap={1}>
              <Button key="tut-volgende" label={s.tutorialStep === TUTORIAL.length - 1 ? 'Klaar' : 'Volgende'} onPress={() => void apply($, x => ({ ...x, tutorialStep: x.tutorialStep + 1 }))} />
              <Button key="tut-overslaan" label="Overslaan" dimColor onPress={() => void apply($, x => ({ ...x, tutorialStep: TUTORIAL.length }))} />
            </Box>
          </Box>
        )}
        {notice !== '' && <Text color="yellow">{notice}</Text>}
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {TABS.map(t => (
            <Button key={`tab-${t.id}`} label={t.id === tab ? `[${t.label}]` : t.label} dimColor={t.id !== tab} onPress={go(t.id)} />
          ))}
        </Box>
        {body}
      </Box>
    )
  })
}

