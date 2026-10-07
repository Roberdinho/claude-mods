import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SessionView } from '../types'
import {
  LINE_PATTERN, TICK_MS, age, applyLines, hotkey, label, newTrack, openerArgv, parsePids, parseRegistry,
  runningTasks, sameView, sessionLink, sortSessions, statusText, taskLabel,
} from './tasks'
import type { RegistryEntry, Track } from './tasks'

const PANE = 'session-tasks'
const TITLE = 'Background tasks'
const sessions = atom({ plugin: 'session-tasks', key: 'sessions' } as const, [])
const nowAtom = atom({ plugin: 'session-tasks', key: 'now' } as const, 0)
const showIdle = atom({ plugin: 'session-tasks', key: 'showIdle' } as const, false)
const errorAtom = atom({ plugin: 'session-tasks', key: 'error' } as const, null)

/** Raw bytes read from a transcript per reader run; its matched lines stay well under 4 MiB. */
const CHUNK = 16 * 1024 * 1024

// Both readers read ST_N bytes from ST_OFFSET, print the lines matching ST_PAT
// up to the last complete line, then `POS <offset after that line>`.
const POWERSHELL_READER = [
  "$ErrorActionPreference='Stop'",
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
  "$fs=[IO.File]::Open($env:ST_FILE,'Open','Read','ReadWrite,Delete')",
  'try { $o=[int64]$env:ST_OFFSET; $n=[int]$env:ST_N; $buf=New-Object byte[] $n; [void]$fs.Seek($o,0); $r=0; while ($r -lt $n) { $k=$fs.Read($buf,$r,$n-$r); if ($k -le 0) { break }; $r+=$k } } finally { $fs.Close() }',
  '$end=-1; if ($r -gt 0) { $end=[Array]::LastIndexOf($buf,[byte]10,$r-1) }',
  '$rx=[regex]$env:ST_PAT',
  'if ($end -ge 0) { foreach ($l in [Text.Encoding]::UTF8.GetString($buf,0,$end+1).Split([char]10)) { if ($rx.IsMatch($l)) { [Console]::Out.WriteLine($l) } } }',
  "[Console]::Out.WriteLine('POS '+($o+$end+1))",
].join('; ')

// Line ends are counted in bytes (LC_ALL=C); a last line with no newline is
// left for the next read.
const SH_READER =
  'tail -c +$((ST_OFFSET+1)) "$ST_FILE" | head -c "$ST_N" | LC_ALL=C awk -v pat="$ST_PAT" -v o="$ST_OFFSET" -v n="$ST_N" ' +
  `'{ if (have) print prev; have=0; start=p; p+=length($0)+1; if ($0 ~ pat) { prev=$0; have=1 } } ` +
  `END { if (p > n) { p=start; have=0 } if (have) print prev; print "POS " (o+p) }'`

type Followed = { file: string | null; offset: number; track: Track }

// Per session: its transcript, how far it has been read and what it said.
// Starts over on a reload, which rereads each transcript once.
const followed = new Map<string, Followed>()
let refreshing = false
let lastStatus: string | undefined

async function isWindows($: EngineInterface): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function configDir($: EngineInterface): Promise<string | null> {
  const configured = await $.env.get('CLAUDE_CONFIG_DIR')
  if (configured) return configured
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))

  return home ? `${home}/.claude` : null
}

/** The running sessions: the registry, less entries whose process is gone. */
async function liveSessions($: EngineInterface, dir: string): Promise<RegistryEntry[]> {
  const entries = await $.fs.list(`${dir}/sessions`).catch(() => [])
  const found: RegistryEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    const text = await $.fs.read(`${dir}/sessions/${entry.name}`).catch(() => null)
    const r = text === null ? null : parseRegistry(text)
    if (r !== null) found.push(r)
  }
  const list = (await isWindows($))
    ? await $.process.run(['tasklist', '/FO', 'CSV', '/NH']).catch(() => null)
    : await $.process.run(['ps', '-A', '-o', 'pid=']).catch(() => null)
  if (list === null || list.exitCode !== 0) return found
  const pids = parsePids(list.stdout)

  return found.filter(r => pids.has(r.pid))
}

/** The transcript of a session: `<config>/projects/<any project>/<id>.jsonl`. */
async function findTranscript($: EngineInterface, dir: string, sessionId: string): Promise<string | null> {
  const projects = await $.fs.list(`${dir}/projects`).catch(() => [])
  for (const p of projects) {
    if (p.kind !== 'dir') continue
    const path = `${dir}/projects/${p.name}/${sessionId}.jsonl`
    if (await $.fs.exists(path)) return path
  }

  return null
}

/** Reads what was appended to a session's transcript since the last read. */
async function follow($: EngineInterface, f: Followed) {
  if (f.file === null) return
  const size = await $.fs.stat(f.file).then(s => s.size, () => -1)
  if (size < 0) return
  if (size < f.offset) {
    f.offset = 0
    f.track = newTrack()
  }
  const windows = await isWindows($)
  while (f.offset < size) {
    const env = {
      ST_FILE: f.file,
      ST_OFFSET: String(f.offset),
      ST_N: String(Math.min(CHUNK, size - f.offset)),
      ST_PAT: LINE_PATTERN,
    }
    const run = windows
      ? await $.process.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_READER], { env, timeoutMs: 60_000 })
      : await $.process.run(['sh', '-c', SH_READER], { env, timeoutMs: 60_000 })
    const lines = run.stdout.split(/\r?\n/)
    const pos = lines.map(l => /^POS (\d+)$/.exec(l)).find(m => m !== null)
    if (run.exitCode !== 0 || pos == null) {
      throw new Error(run.stderr.trim().split(/\r?\n/)[0] || 'the transcript reader failed')
    }
    applyLines(f.track, lines.filter(l => !l.startsWith('POS ')))
    const next = Number(pos[1])
    // Nothing complete to read (a line still being written): try again next tick.
    if (next <= f.offset) break
    f.offset = next
  }
}

async function refresh($: EngineInterface) {
  if (refreshing) return
  refreshing = true
  try {
    const dir = await configDir($)
    if (dir === null) throw new Error('no home folder (USERPROFILE, HOME or CLAUDE_CONFIG_DIR) is set')
    const now = await $.clock.now()
    const live = await liveSessions($, dir)

    const views: SessionView[] = []
    for (const r of live) {
      let f = followed.get(r.sessionId)
      if (f === undefined || f.file === null) {
        f = { file: await findTranscript($, dir, r.sessionId), offset: 0, track: newTrack() }
        followed.set(r.sessionId, f)
      }
      await follow($, f)
      views.push({
        sessionId: r.sessionId,
        title: r.name ?? null,
        cwd: r.cwd,
        status: r.status ?? 'unknown',
        tasks: runningTasks(f.track, r.startedAt, now),
        hasTranscript: f.file !== null,
        link: sessionLink(r),
      })
    }
    for (const id of [...followed.keys()]) if (!live.some(r => r.sessionId === id)) followed.delete(id)

    const sorted = sortSessions(views)
    if (!sameView(await read($, sessions), sorted)) await update($, sessions, () => sorted)
    const minute = Math.floor(now / 60_000) * 60_000
    if ((await read($, nowAtom)) !== minute) await update($, nowAtom, () => minute)
    if ((await read($, errorAtom)) !== null) await update($, errorAtom, () => null)

    const text = statusText(sorted)
    if (text !== lastStatus) {
      lastStatus = text
      $.ui.status(text)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if ((await read($, errorAtom)) !== message) await update($, errorAtom, () => message)
  } finally {
    refreshing = false
  }
}

/** Shows a session in the desktop app by handing its link to the OS. */
async function openSession($: EngineInterface, s: SessionView) {
  if (s.link === null) return
  const platform = (await isWindows($)) ? 'windows' : (await $.env.get('HOME'))?.startsWith('/Users/') ? 'mac' : 'linux'
  const run = await $.process.run(openerArgv(platform, s.link)).catch((err: unknown) => err)
  if (run instanceof Error || (typeof run === 'object' && run !== null && 'exitCode' in run && run.exitCode !== 0)) {
    $.ui.toast(`Could not open ${label(s)}; pick it in the sidebar`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'alltasks',
      description: "Show every session's running background tasks in a side panel",
    })
    $.clock.every(TICK_MS, () => void refresh($))
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'alltasks' }, async $ => {
    void refresh($)
    await $.ui.open({ id: PANE, title: TITLE, focus: true, closeOnEscape: true })

    return { text: 'Background tasks panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const self = await $.session.id()
    const now = await read($, nowAtom)
    const idle = await read($, showIdle)
    const error = await read($, errorAtom)
    const all = await read($, sessions)
    const busy = all.filter(s => s.tasks.length > 0)
    const shown = idle ? all : busy
    const running = busy.reduce((n, s) => n + s.tasks.length, 0)

    return (
      <Box flexDirection="column">
        <Text bold>{`${running} running in ${busy.length} of ${all.length} sessions`}</Text>
        <Button
          key="idle"
          label={idle ? 'Hide idle sessions' : `Show idle sessions (${all.length - busy.length})`}
          hotkey="i"
          plain
          onPress={() => update($, showIdle, v => !v)}
        />
        {error !== null && <Text color="red">{`Could not read the sessions: ${error}`}</Text>}
        {shown.length === 0 && error === null && (
          <Text dimColor>{all.length === 0 ? 'Reading the sessions…' : 'No background tasks in any session.'}</Text>
        )}
        {shown.map((s, i) => (
          <Box key={`s:${s.sessionId}`} flexDirection="column" marginTop={1}>
            <Box>
              <Text bold>{`${label(s)}${s.sessionId === self ? '  (this session)' : ''}  `}</Text>
              {s.link !== null && s.sessionId !== self && (
                <Button key={`open:${s.sessionId}`} label="Open" hotkey={hotkey(i)} plain onPress={() => openSession($, s)} />
              )}
            </Box>
            <Text dimColor>{`${s.status} · ${s.cwd}${s.hasTranscript ? '' : ' · no transcript found'}`}</Text>
            {s.tasks.length === 0 && <Text dimColor>  nothing in the background</Text>}
            {s.tasks.map(t => (
              <Text key={`t:${s.sessionId}:${t.id}`}>
                {`  ${taskLabel(t)}  `}
                <Text dimColor>{t.startedAt > 0 ? `started ${age(now - t.startedAt)}` : ''}</Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
