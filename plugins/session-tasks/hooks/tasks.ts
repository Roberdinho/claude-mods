import type { SessionView, Task } from '../types'

/** How often the sessions and their transcripts are reread. */
export const TICK_MS = 10_000

/**
 * The transcript lines worth handing back from the reader: the tool calls that
 * start or stop background work, their results, and task notifications.
 */
export const LINE_PATTERN =
  '"name":"(Bash|Monitor|Agent|Workflow|TaskStop)"|backgroundTaskId|"taskId"|async_launched|"task_id"|<task-notification>'

/** One entry of `~/.claude/sessions/<pid>.json`, the running-session registry. */
export type RegistryEntry = {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  name?: string
  status?: string
  kind?: string
}

export function parseRegistry(text: string): RegistryEntry | null {
  try {
    const r = JSON.parse(text) as RegistryEntry
    if (typeof r?.sessionId !== 'string' || typeof r.pid !== 'number') return null

    return r
  } catch {
    return null
  }
}

/** The pids in `tasklist /FO CSV /NH` or `ps -A -o pid=` output. */
export function parsePids(text: string): Set<number> {
  const pids = new Set<number>()
  for (const line of text.split(/\r?\n/)) {
    const csv = /^"[^"]*","(\d+)"/.exec(line)
    const bare = /^\s*(\d+)\s*$/.exec(line)
    const pid = csv?.[1] ?? bare?.[1]
    if (pid !== undefined) pids.add(Number(pid))
  }

  return pids
}

type Use = { name: string; input: Record<string, unknown> }

/** What one session's transcript says about its background work so far. */
export type Track = {
  uses: Map<string, Use>
  tasks: Map<string, Task>
  ended: Set<string>
}

export function newTrack(): Track {
  return { uses: new Map(), tasks: new Map(), ended: new Set() }
}

const BACKGROUND_TOOLS = new Set(['Bash', 'Monitor', 'Agent', 'Workflow', 'TaskStop'])

const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

function end(track: Track, id: string) {
  track.tasks.delete(id)
  track.ended.add(id)
}

/** Ends the tasks a `<task-notification>` reports finished, stopped or expired. */
export function applyNotification(track: Track, text: string) {
  if (!text.includes('<task-notification>')) return
  const isOver = /<status>\w+<\/status>/.test(text) || text.includes('[Monitor expired')
  if (!isOver) return
  for (const m of text.matchAll(/<task-id>([^<]+)<\/task-id>/g)) end(track, m[1]!)
}

function startTask(track: Track, id: string, use: Use | undefined, result: Record<string, unknown>, at: number) {
  if (track.ended.has(id) || track.tasks.has(id)) return
  const input = use?.input ?? {}
  const name = use?.name ?? (result.backgroundTaskId !== undefined ? 'Bash' : 'Task')
  const type =
    name === 'Bash' ? 'shell'
    : name === 'Monitor' ? 'monitor'
    : name === 'Agent' ? 'subagent'
    : name === 'Workflow' ? 'workflow'
    : 'task'
  const timeout = typeof result.timeoutMs === 'number' ? result.timeoutMs : undefined
  const task: Task = {
    id,
    type,
    description: str(input.description) ?? str(result.description) ?? str(input.name) ?? '',
    startedAt: at,
  }
  const command = str(input.command)
  if (command !== undefined) task.command = command
  const agentType = str(input.subagent_type)
  if (agentType !== undefined) task.agentType = agentType
  if (type === 'monitor' && timeout !== undefined && result.persistent !== true) task.endsBy = at + timeout
  track.tasks.set(id, task)
}

/** Applies one transcript record (a parsed JSONL line). */
export function applyRecord(track: Track, record: unknown) {
  if (record === null || typeof record !== 'object') return
  const o = record as Record<string, unknown>
  const at = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) || 0 : 0

  if (o.type === 'queue-operation' && typeof o.content === 'string') applyNotification(track, o.content)

  const message = o.message as { content?: unknown } | undefined
  const content = message?.content
  if (typeof content === 'string') applyNotification(track, content)
  if (!Array.isArray(content)) return

  for (const block of content as Record<string, unknown>[]) {
    if (block?.type === 'text' && typeof block.text === 'string') applyNotification(track, block.text)
    if (block?.type === 'tool_use' && typeof block.name === 'string' && BACKGROUND_TOOLS.has(block.name)) {
      track.uses.set(String(block.id), { name: block.name, input: (block.input ?? {}) as Record<string, unknown> })
    }
    if (block?.type !== 'tool_result') continue
    const use = track.uses.get(String(block.tool_use_id))
    const result = o.toolUseResult
    if (result === null || typeof result !== 'object') continue
    const r = result as Record<string, unknown>
    if (use?.name === 'TaskStop' || (use === undefined && str(r.task_id) !== undefined && str(r.message)?.includes('stopped'))) {
      const id = str(r.task_id) ?? str(use?.input.task_id)
      if (id !== undefined) end(track, id)
      continue
    }
    const id =
      str(r.backgroundTaskId)
      ?? (use !== undefined && use.name !== 'Bash' ? str(r.taskId) : undefined)
      ?? (r.status === 'async_launched' ? str(r.agentId) : undefined)
    if (id !== undefined && (use !== undefined || str(r.backgroundTaskId) !== undefined)) startTask(track, id, use, r, at)
    // The call is answered; only its task, if any, is still needed.
    track.uses.delete(String(block.tool_use_id))
  }
}

/** Applies the reader's matched lines; a line that is not JSON is skipped. */
export function applyLines(track: Track, lines: readonly string[]) {
  for (const line of lines) {
    if (line.trim() === '') continue
    try {
      applyRecord(track, JSON.parse(line))
    } catch {
      // A line cut by the reader or not a record at all.
    }
  }
}

/**
 * The tasks still running: started by the session's current process (a task
 * does not outlive the process that started it) and not past a monitor's expiry.
 */
export function runningTasks(track: Track, processStartedAt: number, now: number): Task[] {
  return [...track.tasks.values()]
    .filter(t => t.startedAt === 0 || t.startedAt >= processStartedAt - 5_000)
    .filter(t => t.endsBy === undefined || t.endsBy > now)
    .sort((a, b) => a.startedAt - b.startedAt)
}

/** Busy sessions first (most tasks), then by title. */
export function sortSessions(list: readonly SessionView[]): SessionView[] {
  return [...list].sort((a, b) => b.tasks.length - a.tasks.length || label(a).localeCompare(label(b)))
}

export function counts(list: readonly SessionView[]): { tasks: number; sessions: number } {
  const busy = list.filter(s => s.tasks.length > 0)

  return { tasks: busy.reduce((n, s) => n + s.tasks.length, 0), sessions: busy.length }
}

/** The status line, or undefined when nothing runs anywhere. */
export function statusText(list: readonly SessionView[]): string | undefined {
  const { tasks, sessions } = counts(list)
  if (tasks === 0) return undefined

  return `${tasks} background task${tasks === 1 ? '' : 's'} in ${sessions} session${sessions === 1 ? '' : 's'} · /alltasks`
}

export function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)

  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

/** One line for a task: its kind, then what it is. */
export function taskLabel(t: Task, max = 70): string {
  const what =
    t.type === 'subagent' && t.agentType ? `${t.agentType}: ${t.description}`
    : t.description || t.command || t.id

  return `${t.type.padEnd(8)} ${clip(what, max)}`
}

export function label(s: SessionView): string {
  if (s.title) return s.title
  const parts = s.cwd.split(/[\\/]/).filter(Boolean)

  return `${parts.at(-1) ?? s.cwd} (${s.sessionId.slice(0, 8)})`
}

/** Whether two reads differ in anything the panel shows. */
export function sameView(a: readonly SessionView[], b: readonly SessionView[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
