import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Saved, Snap } from '../types'
import { BROWSERS, copyImageArgv, pageHtml, revealArgv, screenshotArgv, slashes } from './host'
import type { Platform } from './host'
import { cleanPrompt, redact, renderSvg } from './polaroid'
import { THEMES, themeAt, themeIndex } from './themes'

const PANE = 'prompt-polaroid'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const snapAtom = atom({ plugin: 'prompt-polaroid', key: 'snap' } as const, null)
const themeAtom = atom({ plugin: 'prompt-polaroid', key: 'theme' } as const, 0)
const savedAtom = atom({ plugin: 'prompt-polaroid', key: 'saved' } as const, null)

type Settings = {
  handle: string
  showModel: boolean
  tilt: boolean
  isRedacting: boolean
  outputDir: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

const unquote = (text: string): string => text.replace(/^(["'])([\s\S]*)\1$/, '$2')

const isOwnWords = (text: string): boolean =>
  text !== '' && !text.startsWith('/') && !text.startsWith('<command-') && !text.startsWith('<local-command-')

async function platform($: EngineInterface): Promise<Platform> {
  if ((await $.env.get('OS')) === 'Windows_NT') return 'windows'
  const home = (await $.env.get('HOME')) ?? ''

  return home.startsWith('/Users/') ? 'mac' : 'linux'
}

async function expandHome($: EngineInterface, path: string): Promise<string> {
  if (path !== '~' && !path.startsWith('~/') && !path.startsWith('~\\')) return slashes(path)
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '.'

  return `${slashes(home)}${slashes(path.slice(1))}`
}

async function tempDir($: EngineInterface): Promise<string> {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp'

  return slashes(temp).replace(/\/$/, '')
}

/** The nth-last prompt the person typed (1 = the last), cleaned. */
async function pickPrompt($: EngineInterface, nth: number): Promise<string | undefined> {
  const messages = await $.session.messages()
  if ('deny' in messages) return undefined
  const prompts = messages
    .filter(message => message.role === 'user')
    .map(message => cleanPrompt(message.text))
    .filter(isOwnWords)

  return prompts.at(-nth)
}

async function snapOf($: EngineInterface, text: string): Promise<Snap> {
  const now = new Date(await $.clock.now())
  const root = await $.session.root().catch(() => '')
  const project = slashes(root).replace(/\/$/, '').split('/').at(-1) ?? ''

  return {
    text,
    project: project === '' ? 'session' : project,
    model: await $.session.model().catch(() => ''),
    date: `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    stamp: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
  }
}

async function svgOf($: EngineInterface, snap: Snap, settings: Settings): Promise<string> {
  const theme = themeAt(await read($, themeAtom))

  return renderSvg(snap, { theme, handle: settings.handle, showModel: settings.showModel, tilt: settings.tilt })
}

/** Writes the SVG, then develops it into a PNG with a headless Chromium. */
async function rasterize($: EngineInterface, svg: string, png: string): Promise<string | undefined> {
  let browser: string | undefined
  for (const candidate of BROWSERS[await platform($)]) {
    if (browser === undefined && (await $.fs.exists(candidate))) browser = candidate
  }
  if (browser === undefined) return 'no Chrome, Edge or Chromium found'

  const work = `${await tempDir($)}/prompt-polaroid`
  const page = `${work}/snap.html`
  await $.fs.write(page, pageHtml(svg))
  // Chromium's helper processes keep its pipes open after the screenshot, so
  // waiting for it to exit hangs: leave the stream (which ends it) once the
  // file is reported written.
  let log = ''
  try {
    const browserRun = $.process.spawn({ argv: screenshotArgv(browser, page, png, `${work}/profile`) })
    for await (const { text } of browserRun) {
      log += text
      if (log.includes('bytes written to file')) break
    }
  } catch (error) {
    log += String(error)
  }

  return (await $.fs.exists(png)) ? undefined : `browser said: ${log.trim().slice(-160)}`
}

async function save($: EngineInterface, settings: Settings): Promise<void> {
  const snap = await read($, snapAtom)
  if (snap === null) return
  const folder = (await expandHome($, settings.outputDir)).replace(/\/$/, '')
  const base = `${folder}/polaroid_${snap.stamp}`
  const svg = await svgOf($, snap, settings)
  // The SVG write also creates the folder the screenshot lands in.
  await $.fs.write(`${base}.svg`, svg)
  $.ui.toast('Developing your Polaroid…')
  const failure = await rasterize($, svg, `${base}.png`)
  const previous = await read($, savedAtom)
  const saved: Saved = {
    svg: `${base}.svg`,
    png: failure === undefined ? `${base}.png` : undefined,
    generation: (previous?.generation ?? 0) + 1,
  }
  await update($, savedAtom, () => saved)
  $.ui.toast(failure === undefined ? `Saved → ${base}.png` : `Saved SVG only (${failure}) → ${base}.svg`)
}

async function copyImage($: EngineInterface, png: string): Promise<void> {
  const run = await $.process.run(copyImageArgv(await platform($), png), { timeoutMs: 20_000 }).catch(() => undefined)
  $.ui.toast(run?.exitCode === 0 ? 'Polaroid copied to the clipboard' : 'Could not copy the image')
}

async function revealFolder($: EngineInterface, settings: Settings): Promise<void> {
  const folder = await expandHome($, settings.outputDir)
  // explorer.exe exits 1 even when it opened the folder: nothing to check.
  await $.process.run(revealArgv(await platform($), folder), { timeoutMs: 10_000 }).catch(() => undefined)
}

async function cycleTheme($: EngineInterface, step: number): Promise<void> {
  await update($, themeAtom, index => (index + step + THEMES.length) % THEMES.length)
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    handle: String(options.handle ?? ''),
    showModel: options.showModel !== false,
    tilt: options.tilt !== false,
    isRedacting: options.redactSecrets !== false,
    outputDir: String(options.outputDir ?? '~/Pictures/Claude Polaroids'),
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'polaroid',
      description: 'Snap a prompt as a Polaroid: /polaroid [n | "text"]',
      argumentHint: '[n | "text"]',
    })
    await update($, themeAtom, () => themeIndex(options.theme))

    return next(e)
  })

  on('command.run', { command: 'polaroid' }, async ($, e) => {
    const args = e.args.trim()
    const isIndex = args === '' || /^\d+$/.test(args)
    const raw = isIndex ? await pickPrompt($, args === '' ? 1 : Number(args)) : unquote(args)
    if (raw === undefined || raw.trim() === '') {
      return { text: 'No prompt to snap yet. Send one first, or try /polaroid "your text".' }
    }
    const snap = await snapOf($, settings.isRedacting ? redact(raw) : raw)
    await update($, snapAtom, () => snap)
    await update($, savedAtom, () => null)
    await $.ui.open({ id: PANE, title: 'Prompt Polaroid', focus: true })

    return { text: 'Polaroid ready: save it, copy it, or flip through backgrounds in the pane.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    const snap = await read($, snapAtom)
    if (snap === null) {
      return <Text dimColor>Type /polaroid to snap your last prompt.</Text>
    }
    const theme = await read($, themeAtom)
    const saved = await read($, savedAtom)
    const png = saved?.png
    const body = e.props.bodyColumns

    let preview
    if (e.surface !== 'terminal' && 'Svg' in ui) {
      const width = Math.min(440, Math.max(240, body * 7))
      preview = <ui.Svg source={await svgOf($, snap, settings)} alt={`Polaroid of the prompt: ${snap.text}`} width={width} />
    } else if (e.surface === 'terminal' && 'Image' in ui && png !== undefined) {
      const columns = Math.max(20, Math.min(60, body - 2))
      preview = (
        <ui.Image
          source={{ file: png, format: 'png', generation: saved?.generation }}
          columns={columns}
          rows={Math.round(columns * 0.6)}
          alt={snap.text}
        />
      )
    } else {
      const shown = snap.text.length > 400 ? `${snap.text.slice(0, 400)}…` : snap.text
      preview = <Text>{`> ${shown}

(Save to develop the photo and preview it here.)`}</Text>
    }

    return (
      <Box flexDirection="column" gap={1}>
        {preview}
        <Text dimColor>{`${snap.date} · ${snap.project} · background: ${themeAt(theme).label}`}</Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="prev" label="◀" hotkey="p" onPress={() => cycleTheme($, -1)} />
          <Button key="next" label="▶" hotkey="n" onPress={() => cycleTheme($, 1)} />
          <Button key="save" label="Save" hotkey="s" variant="primary" onPress={() => save($, settings)} />
          {png !== undefined && <Button key="copy" label="Copy image" hotkey="c" onPress={() => copyImage($, png)} />}
          {saved !== null && (
            <Button key="folder" label="Open folder" hotkey="o" dimColor onPress={() => revealFolder($, settings)} />
          )}
        </Box>
        {saved !== null && <Text dimColor>{png ?? saved.svg}</Text>}
      </Box>
    )
  })
}
