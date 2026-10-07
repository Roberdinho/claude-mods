/** One background task, as read from a session's transcript. */
export type Task = {
  id: string
  /** shell, monitor, subagent, workflow */
  type: string
  description: string
  command?: string
  agentType?: string
  /** When it was started, ms since the epoch. */
  startedAt: number
  /** A monitor's expiry, when it has one. */
  endsBy?: number
}

/** One running Claude Code session and its background tasks. */
export type SessionView = {
  sessionId: string
  title: string | null
  cwd: string
  /** idle or busy, as the session reports it. */
  status: string
  tasks: Task[]
  /** False when no transcript was found for the session. */
  hasTranscript: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'session-tasks': {
      /** Every running session, as last read. */
      sessions: SessionView[]
      /** Minute the panel's ages are measured against. */
      now: number
      /** Show sessions with no tasks too. */
      showIdle: boolean
      /** Why the last read failed, if it did. */
      error: string | null
    }
  }
}
