# Claude DJ 🎧

Control your music from Claude Code: YouTube Music, Spotify, a browser tab, anything
that shows up in the Windows media flyout.

```
♪ Midnight City — M83 · Chrome  ⏮  ⏸  ⏭  🔊 − 40% +
```

## Use

- **Now-playing band** above the prompt, with previous / play-pause / next buttons and
  mute / volume down / volume up.
- **Commands** (they also work while Claude is busy):

| Command | Does |
| --- | --- |
| `/dj` | toggle play/pause |
| `/dj play`, `/dj pause`, `/dj next`, `/dj prev` | what it says |
| `/play`, `/pause`, `/next`, `/prev` | short forms |
| `/vol` | show the volume |
| `/vol 40`, `/vol +5`, `/vol -5`, `/vol up`, `/vol down` | set or change the volume |
| `/vol mute`, `/vol unmute` (or `/dj mute`, `/dj vol 40`) | mute and unmute |

- **Music tools for Claude**: ask *"what's playing?"*, *"skip this one"*, *"turn it down
  a bit"* or *"pause the music while you run the tests"*. Claude gets `now_playing`,
  `music_control` and `music_volume` tools.

## How it works

The mod runs one hidden Windows PowerShell watcher per session that reads the system media
session (SMTC), the same one behind the media keys and the volume flyout. No API keys or
sign-in needed, and no browser extension. When several apps play at once it prefers the one
with an artist (music) and sticks with it.

Volume is the **system output volume**, the one your volume keys and the taskbar flyout
change. Windows doesn't expose a per-app volume for another app's audio session on current
Windows 11 builds, so the mod can't change only the browser's or player's slider in the
volume mixer.

The watcher exits with the session, or by itself two minutes after the session stops
sending a heartbeat.

## Settings

In the config menu (or `pluginConfigs["claude-dj"].options` in `settings.json`):

| Option | Default |
| --- | --- |
| `showBand` | `true`; off shows a `♪ Title — Artist` status line entry instead |
| `volumeStep` | `10`; how far the band's − / + and `/vol up` / `down` move the volume |
| `musicTools` | `true`; off hides the music tools from Claude |

## Requirements

- Claude Code with function-hook plugins (mods).
- Windows 10 or 11. macOS and Linux are planned.

## Roadmap

- `/music` pane with cover art and progress
- macOS (`nowplaying-cli`) and Linux (`playerctl`)
- YouTube Music desktop bridge (th-ch/youtube-music API server, ytmdesktop Companion):
  search, queue, like
- Spotify Web API: search, queue, devices
