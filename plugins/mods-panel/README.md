# mods-panel

A side panel listing every installed mod that adds commands. Pick a mod to see its commands, then pick a command:

- **No arguments** → it runs right away.
- **Takes arguments** (or it is unknown whether it does) → `/<command> ` is put in the prompt bar and the panel closes, so you can type the rest and press Enter.

The panel only opens when you ask for it:

```
/mods            # the list of mods
/mods claude-dj  # straight to one mod's commands
```

Keys: `1`–`9` pick a row, `b` goes back to the mod list, Esc closes the panel.

## Uninstalling a mod

On a mod's page, press `u` (**Uninstall mod**), then `y` to confirm or `n` to cancel. The panel runs `claude plugin uninstall <mod>@<marketplace> --scope <scope>` for each install of that mod it finds in `claude plugin list --json`, in whatever scope it was installed. The mod keeps running until the session restarts (or `/reload-plugins`). A mod loaded with `--plugin-dir` isn't installed from a marketplace, so there's nothing to uninstall and the panel tells you so.

## How it decides

The panel learns each command's argument hint from the engine's `command.describe` event, the same hint the typeahead shows dim after a command's name (`/vol <0-100>`). A command with a hint, or one the engine never described, fills the prompt; a command described without a hint runs. Labels show `…` for the unknown case.

Mods that only add hooks, panes or tools, with no slash commands, are not listed.
