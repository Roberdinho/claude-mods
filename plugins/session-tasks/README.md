# session-tasks

A session can show as **Completed** while background tasks it started (shells, subagents, monitors, workflows) are still running. Claude Code shows background tasks only inside the session that owns them. This mod collects them from every running session, including sessions that don't run the mod:

- **Status line**: `3 background tasks in 2 sessions · /alltasks` whenever anything runs anywhere.
- **`/alltasks`**: a side panel listing each session (by title) with its running tasks and when each started. Press `i` to also show idle sessions.

## How it works

Every 10 s the mod:

1. Reads the running sessions from `~/.claude/sessions/<pid>.json`, the registry Claude Code keeps, and drops entries whose process is gone (`tasklist` on Windows, `ps` elsewhere).
2. Finds each session's transcript, `~/.claude/projects/<project>/<session-id>.jsonl`, and reads only what was added since the last read. A small reader (PowerShell on Windows, `tail` and `awk` elsewhere) skips to where the last read stopped and passes back only the lines about background work, so even a 35 MB transcript takes about a second to read the first time and almost nothing after that.
3. Works out which tasks are running:
   - **Started**: a background Bash call (`backgroundTaskId`), a Monitor (`taskId`), a background Agent (`async_launched`) or a Workflow.
   - **Ended**: a task notification with a status (completed, failed, killed, stopped), a Monitor-expired notice, a TaskStop, or a non-persistent Monitor's timeout passing.
   - **Gone with an earlier process**: tasks started before the session's current process (a session that was closed and resumed) are left out.

The panel redraws only when something it shows has changed.

## Limits

- This is worked out from the transcript, not from Claude Code's own task list. A task that dies without a notification (its process was killed from outside) stays listed until its session restarts.
- Background work started by a subagent is in the subagent's own transcript and is not listed.
- The Mac/Linux reader (`tail`, `head`, `awk`) has not been tested yet; Windows has.
