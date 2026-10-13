# group-toggle

With many folders and sessions, switching the Code-tab sidebar between **group by folder** and **group by state** means scrolling up to its filter button every time. This mod puts the switch where it is always in view:

- **A line above the prompt**: `Group sidebar: ● Folder ○ State`. Click Folder or State and the sidebar regroups at once; the filled dot shows the current grouping. Another mod's band above the prompt (claude-dj's now playing) stays, above this line.
- **`/group`**: toggles between folder and state. `/group folder` and `/group state` pick one.

## How it works

The mod calls the desktop app's own sidebar tools (`ccd_sidebar`): `list_sections` to read the current grouping when the session starts, `set_view` with `group_by` to change it. That is the same setting as the filter menu, so:

- Choosing **State** also sets the status filter to *active*, as the menu does.
- Choosing another grouping in the menu (date, none, ...) leaves both dots open; the buttons still work.

If the sidebar cannot be read or changed (no app window open, a terminal session), the line shows a ⚠ with the reason.

## Limits

- Desktop app only: the sidebar tools exist only there.
