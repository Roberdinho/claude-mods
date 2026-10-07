import { describe, expect, mock, test } from 'claude-code/testing'

import { cleanPrompt, escapeXml, layout, redact, renderSvg, wrap } from '../hooks/polaroid'
import { copyImageArgv, fileUrl } from '../hooks/host'
import { THEMES, themeAt, themeIndex } from '../hooks/themes'

const SNAP = {
  text: 'Make <b>me</b> a "polaroid" & share it',
  project: 'demo',
  model: 'claude-opus-5-5',
  date: '7 Oct 2026',
  stamp: '2026-10-07_143000',
}

describe('the picture', () => {
  test('escapes markup in the prompt', () => {
    expect(escapeXml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
    const svg = renderSvg(SNAP, { theme: themeAt(0), handle: '@me', showModel: true, tilt: true })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.includes('<b>')).toBe(false)
    expect(svg.includes('&lt;b&gt;me&lt;/b&gt;')).toBe(true)
    expect(svg.includes('@me')).toBe(true)
    expect(svg.includes('claude-opus-5-5')).toBe(true)
    expect(svg.length < 131072).toBe(true)
  })

  test('leaves the model and background out when asked', () => {
    const svg = renderSvg(SNAP, { theme: THEMES[themeIndex('transparent')]!, handle: '', showModel: false, tilt: false })
    expect(svg.includes('claude-opus-5-5')).toBe(false)
    expect(svg.includes('url(#bg)')).toBe(false)
    expect(svg.includes('rotate(0 ')).toBe(true)
  })

  test('wraps words and splits ones longer than a line', () => {
    expect(wrap('aaa bbb ccc', 7)).toEqual(['aaa bbb', 'ccc'])
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
    expect(wrap('one\n\ntwo', 10)).toEqual(['one', '', 'two'])
  })

  test('shrinks the font for long prompts and truncates the longest', () => {
    expect(layout('short').fontSize).toBe(34)
    const long = layout('word '.repeat(400))
    expect(long.fontSize < 34).toBe(true)
    const huge = layout('word '.repeat(5000))
    expect(huge.isTruncated).toBe(true)
    expect(huge.lines.at(-1)?.endsWith('…')).toBe(true)
  })
})

describe('privacy', () => {
  test('redacts keys, tokens and e-mail addresses', () => {
    const out = redact('key sk-ant-abcdefghijklmnopqrstu mail me@example.com password=hunter2 ghp_abcdefghijklmnopqrstuvwxyz')
    expect(out.includes('sk-ant-abc')).toBe(false)
    expect(out.includes('me@example.com')).toBe(false)
    expect(out.includes('hunter2')).toBe(false)
    expect(out.includes('ghp_')).toBe(false)
    expect(out.includes('password=')).toBe(true)
  })

  test('strips harness wrappers from a prompt', () => {
    expect(cleanPrompt('hi<system-reminder>secret context</system-reminder>\r\nthere')).toBe('hi\nthere')
  })
})

describe('the host side', () => {
  test('builds file URLs and clipboard commands per platform', () => {
    expect(fileUrl('C:\\Users\\a b\\snap.html')).toBe('file:///C:/Users/a%20b/snap.html')
    expect(copyImageArgv('windows', 'C:/x/p.png')[0]).toBe('powershell.exe')
    expect(copyImageArgv('mac', '/x/p.png')[0]).toBe('osascript')
    expect(copyImageArgv('linux', '/x/p.png')[0]).toBe('xclip')
  })
})

describe('the pane', () => {
  test('/polaroid with text opens a pane that previews it on every surface', async ($, on) => {
    mock.clock(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const ran = await $.command.run({ command: 'polaroid', args: '"Hello polaroid"' })
    expect(ran.text?.startsWith('Polaroid ready')).toBe(true)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'prompt-polaroid',
        surface,
        component: 'Pane',
        requestId: 'prompt-polaroid',
        props: { title: 'Prompt Polaroid', isFocused: false, bodyColumns: 60 } as never,
      })
      expect(await ui.find({ key: 'save' })).toBeDefined()
      expect(await ui.find({ key: 'next' })).toBeDefined()
      const before = (await ui.find({ type: 'Text', text: /background: / }))?.text
      expect(before?.includes('background: ')).toBe(true)
      await ui.press({ key: 'next' })
      expect((await ui.find({ type: 'Text', text: /background: / }))?.text === before).toBe(false)
      if (surface === 'terminal') expect((await ui.find({ type: 'Text', text: /^> / }))?.text.startsWith('> Hello polaroid')).toBe(true)
      else expect(await ui.find({ type: 'Svg' })).toBeDefined()
      await ui.unmount()
    }
  })
})
