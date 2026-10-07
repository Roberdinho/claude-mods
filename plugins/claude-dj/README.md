# Claude DJ 🎧

Control your music from Claude Code: YouTube Music, Spotify, a browser tab, anything
that shows up in the Windows media flyout.

```
♪ Midnight City — M83 · Chrome  ⏮  ⏸  ⏭  🔊 − 40% +  ✕
```

## Use

- **Now-playing band** above the prompt, with previous / play-pause / next buttons and
  mute / volume down / volume up. **✕** hides it (a `♪ Title — Artist` status line entry
  takes its place); `/dj show` brings it back. It stays hidden across sessions until you do.
- **`/music` pane**: the cover art, title, artist and album, a progress bar that moves while
  the track plays (`1:10 ━━━━━━●────────── 4:03`), and bigger controls with hotkeys while the
  pane has focus: `k` play/pause, `p` / `n` previous / next, `m` mute, `d` / `u` volume
  down / up, `l` like (Spotify). The cover shows as a picture in the desktop app and VS Code;
  in the terminal it does in kitty and Ghostty, and is left out elsewhere.
- **Commands** (they also work while Claude is busy):

| Command | Does |
| --- | --- |
| `/dj` | toggle play/pause |
| `/dj play`, `/dj pause`, `/dj next`, `/dj prev` | what it says |
| `/play`, `/pause`, `/next`, `/prev` | short forms |
| `/vol` | show the volume |
| `/vol 40`, `/vol +5`, `/vol -5`, `/vol up`, `/vol down` | set or change the volume |
| `/vol mute`, `/vol unmute` (or `/dj mute`, `/dj vol 40`) | mute and unmute |
| `/dj hide`, `/dj show` | hide or show the band |
| `/music` | open the Now playing pane |

- **Music tools for Claude**: ask *"what's playing?"*, *"skip this one"*, *"turn it down
  a bit"* or *"pause the music while you run the tests"*. Claude gets `now_playing`,
  `music_control` and `music_volume` tools.

## Spotify

Play, pause, skip and volume already work for the Spotify app without setup. Sign in to
Spotify for more:

| Command | Does |
| --- | --- |
| `/spotify <song>` or `/play <song>` | find a song and play it |
| `/spotify album …`, `/spotify artist …`, `/spotify playlist …` | play a whole album, artist or playlist |
| `/spotify <spotify: URI or open.spotify.com link>` | play exactly that |
| `/spotify queue <song>` | add a song to the queue |
| `/spotify like` (or ♥ on the band) | save the playing song to Liked Songs |
| `/spotify devices`, `/spotify device <name>` | list devices, move playback to one |
| `/spotify`, `/spotify login`, `/spotify logout` | status, sign in, sign out |

Claude also gets `spotify_search`, `spotify_play`, `spotify_queue` and `spotify_like`, so
*"put on some lofi for focus"* or *"queue something like this"* work.

When Spotify isn't open anywhere, the mod starts the Spotify app on this PC and plays there.

### Setup (once)

Spotify only gives API access to apps you register yourself, and the account has to be
**Premium** (Spotify's rule since February 2026; free accounts can search but not play
or queue).

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard), create an
   app, and pick **Web API**.
2. Add the Redirect URI `http://127.0.0.1:43117/callback` exactly.
3. Copy the app's **Client ID** into claude-dj's `spotifyClientId` setting.
4. Run `/spotify login` and approve in the browser tab that opens.

The sign-in uses PKCE, so there's no client secret. Tokens are kept in the mod's own store
on this machine and refreshed automatically. `/spotify logout` forgets them; remove the app at
[spotify.com/account/apps](https://www.spotify.com/account/apps/) to revoke access fully.

## How it works

The mod runs one hidden Windows PowerShell watcher per session that reads the system media
session (SMTC), the same one behind the media keys and the volume flyout. No API keys or
sign-in needed, and no browser extension. When several apps play at once it prefers the one
with an artist (music) and sticks with it.

Volume is the **system output volume**, the one your volume keys and the taskbar flyout
change. Windows doesn't expose a per-app volume for another app's audio session on current
Windows 11 builds, so the mod can't change only the browser's or player's slider in the
volume mixer.

The pane's cover comes from the same media session (the artwork the app hands Windows; for a
YouTube video that's its thumbnail, cropped to a square). Covers are kept as small temporary
files and replaced when the track changes.

The watcher exits with the session, or by itself two minutes after the session stops
sending a heartbeat.

## Settings

In the config menu (or `pluginConfigs["claude-dj"].options` in `settings.json`):

| Option | Default |
| --- | --- |
| `showBand` | `true`; off shows a `♪ Title — Artist` status line entry instead |
| `volumeStep` | `10`; how far the band's − / + and `/vol up` / `down` move the volume |
| `spotifyClientId` | *(empty)*; your Spotify app's Client ID, which turns on `/spotify` and the Spotify tools |
| `musicTools` | `true`; off hides the music tools from Claude |

## Requirements

- Claude Code with function-hook plugins (mods).
- Windows 10 or 11. macOS and Linux are planned.
- For the Spotify features: a Spotify Premium account and your own Spotify app (see Setup).

## Roadmap

- macOS (`nowplaying-cli`) and Linux (`playerctl`)
- YouTube Music desktop bridge (th-ch/youtube-music API server, ytmdesktop Companion):
  search, queue, like
