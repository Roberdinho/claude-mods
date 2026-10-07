import { describe, expect, test } from 'claude-code/testing'

import {
  age, applyLines, newTrack, parsePids, parseRegistry, runningTasks, statusText, taskLabel,
} from '../hooks/tasks'

const T0 = Date.parse('2026-10-07T12:00:00.000Z')
const at = (min: number) => new Date(T0 + min * 60_000).toISOString()

const use = (id: string, name: string, input: object, min: number) =>
  JSON.stringify({ type: 'assistant', timestamp: at(min), message: { content: [{ type: 'tool_use', id, name, input }] } })
const result = (id: string, toolUseResult: object, min: number) =>
  JSON.stringify({ type: 'user', timestamp: at(min), message: { content: [{ type: 'tool_result', tool_use_id: id }] }, toolUseResult })
const notice = (ids: string[], body: string, min: number) =>
  JSON.stringify({
    type: 'user', timestamp: at(min),
    message: { content: `<task-notification>\n${ids.map(i => `<task-id>${i}</task-id>`).join('\n')}\n${body}\n</task-notification>` },
  })

describe('reading a transcript', () => {
  test('background shells, monitors and agents start; foreground calls do not', () => {
    const track = newTrack()
    applyLines(track, [
      use('u1', 'Bash', { command: 'npm run dev', description: 'Dev server', run_in_background: true }, 0),
      result('u1', { stdout: '', backgroundTaskId: 'b1' }, 0),
      use('u2', 'Monitor', { command: 'tail -f log', description: 'Watch log' }, 1),
      result('u2', { taskId: 'm1', timeoutMs: 1_800_000, persistent: false }, 1),
      use('u3', 'Agent', { description: 'Review', subagent_type: 'Explore', prompt: '...' }, 2),
      result('u3', { isAsync: true, status: 'async_launched', agentId: 'a1' }, 2),
      use('u4', 'Bash', { command: 'ls' }, 3),
      result('u4', { stdout: 'x' }, 3),
    ])
    const running = runningTasks(track, T0, T0 + 5 * 60_000)
    expect(running.map(t => [t.id, t.type])).toEqual([['b1', 'shell'], ['m1', 'monitor'], ['a1', 'subagent']])
    expect(taskLabel(running[2]!)).toBe('subagent Explore: Review')
  })

  test('notifications with a status, monitor expiry and TaskStop end tasks', () => {
    const track = newTrack()
    applyLines(track, [
      use('u1', 'Bash', { description: 'one', run_in_background: true }, 0),
      result('u1', { backgroundTaskId: 'b1' }, 0),
      use('u2', 'Bash', { description: 'two', run_in_background: true }, 0),
      result('u2', { backgroundTaskId: 'b2' }, 0),
      use('u3', 'Monitor', { description: 'watch' }, 0),
      result('u3', { taskId: 'm1', timeoutMs: 1_800_000 }, 0),
      use('u4', 'Monitor', { description: 'watch 2' }, 0),
      result('u4', { taskId: 'm2', timeoutMs: 1_800_000 }, 0),
      notice(['m1'], '<summary>Monitor event</summary><event>a line</event>', 1),
      notice(['b1'], '<status>completed</status>', 2),
      notice(['m2'], '<event>[Monitor expired after 30m with 3 events delivered.]</event>', 3),
      use('u5', 'TaskStop', { task_id: 'b2' }, 4),
      result('u5', { message: 'Successfully stopped task: b2', task_id: 'b2' }, 4),
    ])
    expect(runningTasks(track, T0, T0 + 5 * 60_000).map(t => t.id)).toEqual(['m1'])
  })

  test('a monitor is over past its timeout, a task from an earlier process is gone', () => {
    const track = newTrack()
    applyLines(track, [
      use('u1', 'Monitor', { description: 'watch' }, 0),
      result('u1', { taskId: 'm1', timeoutMs: 1_800_000 }, 0),
      use('u2', 'Bash', { description: 'old', run_in_background: true }, 0),
      result('u2', { backgroundTaskId: 'b1' }, 0),
    ])
    expect(runningTasks(track, T0, T0 + 31 * 60_000).map(t => t.id)).toEqual(['b1'])
    expect(runningTasks(track, T0 + 60_000, T0 + 2 * 60_000).map(t => t.id)).toEqual([])
  })

  test('one notification can end several tasks, and junk lines are skipped', () => {
    const track = newTrack()
    applyLines(track, [
      use('u1', 'Bash', { run_in_background: true }, 0),
      result('u1', { backgroundTaskId: 'b1' }, 0),
      use('u2', 'Bash', { run_in_background: true }, 0),
      result('u2', { backgroundTaskId: 'b2' }, 0),
      '{"cut off',
      notice(['b1', 'b2', '__orphan_summary__:shell'], '<status>stopped</status>', 1),
    ])
    expect(track.tasks.size).toBe(0)
  })
})

describe('sessions', () => {
  test('reads the registry and the process lists', () => {
    expect(parseRegistry('{"pid":12,"sessionId":"s","cwd":"C:\\\\x","startedAt":1,"name":"Play"}')?.name).toBe('Play')
    expect(parseRegistry('nope')).toBe(null)
    expect([...parsePids('"claude.exe","12676","Console","1","100 K"\r\n"x.exe","4","S","0","1 K"')]).toEqual([12676, 4])
    expect([...parsePids('  1\n 345\n')]).toEqual([1, 345])
  })

  test('status line counts the busy sessions', () => {
    const task = { id: 'b', type: 'shell', description: 'x', startedAt: T0 }
    const s = (id: string, n: number) => ({
      sessionId: id, title: id, cwd: '/x', status: 'idle', hasTranscript: true, tasks: Array(n).fill(task),
    })
    expect(statusText([s('a', 2), s('b', 1), s('c', 0)])).toBe('3 background tasks in 2 sessions · /alltasks')
    expect(statusText([s('c', 0)])).toBe(undefined)
  })

  test('ages', () => {
    expect(age(5_000)).toBe('just now')
    expect(age(5 * 60_000)).toBe('5m ago')
    expect(age(3 * 3_600_000)).toBe('3h ago')
  })
})
