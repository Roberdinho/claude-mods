# rwoel-mods

Claude Code mods. Install:

```bash
claude plugin marketplace add Roberdinho/claude-mods
claude plugin install prompt-polaroid@rwoel-mods
claude plugin install claude-dj@rwoel-mods
claude plugin install claude-pets@rwoel-mods
claude plugin install coding-pet@rwoel-mods
claude plugin install mods-panel@rwoel-mods
```

Then run `/reload-plugins` (or start a new session) and type `/polaroid`, `/dj`, `/pet`, `/codepet` or `/mods`.

| Mod | What it does |
| --- | --- |
| [prompt-polaroid](plugins/prompt-polaroid) | CodeSnap-style Polaroid snapshots of your prompts |
| [claude-dj](plugins/claude-dj) | Control YouTube Music, Spotify and other media: now-playing band, `/music` pane with cover art, `/play` `/next` `/vol`, `/spotify`, music tools for Claude |
| [claude-pets](plugins/claude-pets) | VS Code Pets for Claude Code: pets above your prompt that chase balls and react to Claude, `/pet` |
| [coding-pet](plugins/coding-pet) | A Tamagotchi-style coding companion that earns XP from edits, tests and commits, levels up, and needs feeding, play and rest, `/codepet` |
| [mods-panel](plugins/mods-panel) | A side panel listing your installed mods; pick one to see its commands, pick a command to run it (or fill the prompt when it takes arguments), `/mods` |
