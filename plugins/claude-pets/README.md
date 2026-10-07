# Claude Pets 🐾

[VS Code Pets](https://github.com/tonybaloney/vscode-pets), but for Claude Code: little pets that
live above your prompt, wander around, chase the ball you throw, and keep an eye on Claude.

```
  /\_/\                          ▐▛███▜▌                   (\/)(o,o)(\/)     [ ball ]
 ( ^.^ )♥          ●            ▝▜█████▛▘                     //   \\
~ (")(")                          ▘▘ ▝▝
```

## Use

You start with **Clawd**. Add more with `/pet`:

| Command | Does |
| --- | --- |
| `/pet add cat`, `/pet add dog Biscuit`, `/pet fox` | adopt a pet, optionally with a name |
| `/pet ball` (or the band's `ball` button, hotkey `b`) | throw a ball; everyone chases it |
| `/pet list` | who lives here |
| `/pet rename Luna Nova` | rename a pet |
| `/pet remove Luna` | say goodbye |
| `/pet` | open the pets in a side panel (Esc or its **close** button closes it) |
| `/pet hide`, `/pet show` | put the band and panel away, and bring them back |

In the desktop app, which draws nothing above the prompt, a session starts with the pets in
their side panel (without taking the keyboard) unless `/pet hide` put them away.

Pets: `clawd`, `cat`, `dog`, `crab` (Ferris), `fox`, `duck` (a rubber duck, naturally),
`rabbit`, `snake`. Up to 8 at once. Your pets are remembered across sessions.

## What they do

- Walk, run, sit and turn around on their own.
- Chase and catch the ball (`●`), then show a ♥.
- **React to Claude**: a pet cheers (♥) when a turn finishes, and looks worried (!) when a
  tool call fails.
- Fall asleep (`zZ`) when you've been away a while, and wake up when you type.

## Settings

In the config menu (or `pluginConfigs["claude-pets"].options` in `settings.json`):

| Option | Default |
| --- | --- |
| `sleepAfterMinutes` | `5`; minutes without a prompt before the pets nap; `0` keeps them awake |
| `reactions` | `true`; off and they ignore Claude |

## Requirements

Claude Code with function-hook plugins (mods). Any OS, terminal or desktop.

## Roadmap

- More pets (VS Code Pets has a zoo: chicken, panda, turtle, rocky…) and colors
- Pixel-art sprites in terminals that support images
- Pets saying hello to each other
