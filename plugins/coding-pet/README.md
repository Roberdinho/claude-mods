# Coding Pet 🥚

A Tamagotchi-style companion for Claude Code, after the VS Code extension
[Coding Pet](https://github.com/Starland9/coding-pet). It hatches from an egg, earns XP
while you and Claude code, levels up and grows, and needs feeding, play and rest.

```
   /\_/\     Byte · Lv 4 baby · coding with you ⌨ ..        [ feed ]
  ( ò_ó )    XP ██████████░░░░░░░░░░ 212/400                 [ play ]
   (")(")    ♥ ██████░░  ⚡ █████░░░  🍖 ███░░░░░              [ rest ]
```

## Use

- **The pet above the prompt**: its sprite, level, mood, XP bar and happiness ♥, energy ⚡
  and fullness 🍖, with **feed**, **play** and **rest** buttons (hotkeys `f` `p` `r` once
  the band has focus). On a narrow window it shrinks to one line.
- **`/codepet`** (or the band's **panel** button, `o`) opens its side panel: level
  progress, stats, today's XP per source, lifetime totals, achievements, and a button per
  food. In the desktop app the pet there is an animated picture that bounces, blinks and
  dozes; in a terminal it is the text sprite. The desktop app opens the panel when a
  session starts (without taking the keyboard), unless `/codepet close` or
  `/codepet hide` put it away; a terminal starts with the strip above the prompt.

| Command | Does |
| --- | --- |
| `/codepet` | open the panel (Esc or its **close** button closes it) |
| `/codepet close`, `/codepet show` | put away the panel and the strip above the prompt (toasts still come), and bring the strip back |
| `/codepet feed [apple\|pizza\|coffee\|cookie]` | feed it (apple when you don't say) |
| `/codepet foods` | what each food does |
| `/codepet play` | play ball: happier, but it costs energy |
| `/codepet rest` | a 20 minute nap that restores energy; again to wake it |
| `/codepet stats` | everything about it, as text |
| `/codepet name <name>`, `/codepet species <blob\|cat\|crab>` | rename it, or change what it is |
| `/codepet hide` | hide it completely, silent too: no strip, panel, toasts or status line (it still earns XP); `/codepet show` brings it back |
| `/codepet reset confirm` | say goodbye and start over with a new egg |

## How it grows

| Claude does | XP |
| --- | --- |
| a passing test run (`npm test`, `pytest`, `cargo test`, `go test`, …) | +15 |
| a `git commit` | +20 |
| an edit (Edit, Write, NotebookEdit) | +5 |
| a file read | +2 |
| a turn finished | +3 |
| you send a prompt | +1 |
| a tool fails | no XP, and it gets a bit sad |

Each kind has a short cooldown so a burst of reads doesn't farm XP. A hungry or worn-out
pet learns at half speed, so look after it. Levels take `50 × level^1.5` XP; it hatches
at level 3, is a teen at 10 and an adult at 25, each stage looking different.

While you are away it gets hungry and a little sad, and gets its energy back; after a
week alone it stops decaying. It sulks, it never dies. It tells you (a toast) when it is
hungry, tired or sad, and celebrates level-ups, growing up and achievements.

## Settings

In the plugin's config: **Pet name**, **Species** (blob, cat, crab), **Difficulty**
(chill: half the decay, hardcore: double), **Pet above the prompt**, **Status line
entry** (`🐣 Byte Lv4 ♥82`), **Say when it needs you**, **XP for reading files**, and
**Let Claude check on the pet** (a `pet_status` tool, so you can ask Claude how it is).

## Build on it

Coding Pet adds `$.codingPet` to the engine, so other plugins can reward and extend it.
List `coding-pet` under `dependencies` in your `plugin.json` and its types appear in your
`.claude-plugin/types/`.

```ts
on('session.start', async ($, e, next) => {
  const started = await next(e)
  // A new food, an XP rule of your own and an achievement for it.
  await $.codingPet.addFood({ id: 'taco', emoji: '🌮', effect: { fullness: 30, happiness: 5 }, cooldownMs: 0 })
  await $.codingPet.addActivity({ kind: 'lint', label: 'Lint runs', xp: 4, on: 'tool', tools: ['Bash'], command: '\\beslint\\b', cooldownMs: 10_000 })
  await $.codingPet.addAchievement({ id: 'tidy', title: 'Tidy', emoji: '🧹', description: '50 lint runs', when: { total: { kind: 'lint', atLeast: 50 } } })
  return started
})

// Grant XP for something only your plugin sees (capped at 50 per grant).
await $.codingPet.award({ kind: 'music', xp: 5, reason: 'coded to music' })

// Read the pet: name, species, stage, level, XP, stats, mood, achievements.
const pet = await $.codingPet.get()
```

| Method | Does |
| --- | --- |
| `get()` | the pet now (`CodingPetView`) |
| `award({ kind, xp?, reason? })` | grant XP for an activity |
| `act(action)` | feed, play, rest, rename, change species |
| `addSpecies(species)` | a new species: per stage two frames of rows, `{f}` where the face goes |
| `addFood(food)` | a new food and what it does to the stats |
| `addActivity(rule)` | a new XP rule: a tool call (by tool and shell-command pattern), a failed one, a prompt, a turn, or a named award; added rules match before the built-in ones |
| `addAchievement(achievement)` | earned at a level, a count of an activity, or a feeding streak |

Rows added this way last for the session, so add them from your `session.start`.

## Layout

- `hooks/core.ts`: the rules, as one pure reducer `reduce(pet, action, now, registry)`
- `hooks/registry.ts`: species art, foods, XP rules and achievements, as plain tables
- `hooks/activity.ts`: which tool calls, prompts and turns count as what
- `hooks/draw.ts`: sprites, bars and text
- `hooks/register.tsx`: the band, the pane, `/codepet`, toasts and `$.codingPet`

```bash
claude plugin test plugins/coding-pet
```
