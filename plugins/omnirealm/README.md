# omnirealm

OmniRealm, a god-simulator sandbox in a side panel. A procedural world of oceans, coasts, forests, mountains, tundra, desert, swamps and enchanted groves; humans, elves, orcs and dwarves who found kingdoms, farm, build, advance through the ages, make alliances, go to war and rebel; and you, with the power to reshape the land, seed life and intervene.

```
/omnirealm
```

On the desktop the map is pixel art with buttons and dropdowns; in the terminal it is drawn in coloured text with a clickable text toolbar. Click the map to give it the keyboard; Esc hands it back.

## Powers

Pick a category, then a tool. A line under the toolbar says what the tool does.

| Category | Tools |
| --- | --- |
| Terrain | Ocean, Shallows, Sand, Grass, Forest, Hills, Mountain, Desert, Tundra, Swamp, Enchanted, Corrupted, Heat, Cool |
| Nature | Rain, Lightning, Fire, Tornado, Earthquake, Volcano |
| Life | Humans, Elves, Orcs, Dwarves, Sheep, Chickens, Wolves, Bears, Dragon, Demon, UFO |
| Destroy | Dynamite, Bomb, Napalm, Atomic, Antimatter |
| Magic | Plague, Zombies, Madness, Healing, Blessing, Curse |
| Inspect | Inspect a creature, Remove life |

Click or drag on the map to use a tool; brushes go from 1 to 6. Dragons, demons and UFOs land where you click. When nothing can be placed (people on water, a full world) the panel says why.

**Inspect** a creature to see its age, health, damage, armour, speed and traits. Click a trait to remove it, add a random one, follow the creature, or smite it.

## The world

- **Kingdoms** grow from villages, gather wood, stone and food, raise houses and children, and research their way from the Stone Age to the Arcane Age. A ruler is crowned when the throne is empty.
- **Diplomacy** follows race and distance: neighbours fall out and declare war, allies join in, weary realms make peace, and a sprawling or leaderless kingdom may split in rebellion.
- **Traits** are inherited and random: genius, immune, bloodlust, giant, fast, strong, lucky, wise, fire proof, regenerates, weak, slow, frail.
- **Realms** lists every kingdom with its people, houses, age, ruler, wars and allies, and the chronicle of the world.

## Controls

| Control | Desktop | Terminal |
| --- | --- | --- |
| Pause / play | ❚❚ Pause | Space |
| Speed 1×, 2×, 4× | ⏩ Speed | 1, 2, 3 |
| Brush size | − Smaller, + Bigger | `[` and `]` |
| Pan | Right-drag, arrows or WASD | Right-drag, arrows or WASD |
| Zoom | 🔭 Zoom out / 🔎 Zoom in | z |
| Kingdom borders | 🗺️ Borders | b |
| Realms and chronicle | 👑 Realms | r |
| Category, tool | Dropdowns | Tab, q and e |
| Save, load | 💾 Save, 📂 Load | Shift+S, Shift+L |
| New world | 🌍 New world | the New world button |

Save keeps one world, across sessions.

## How it draws

The game runs inside a `Client` region on the panel's own frame clock. On the desktop it posts each frame to the hooks module, which paints it as SVG (textured terrain, sprites tinted by kingdom, fire, storms and explosions), with the game's input region laid exactly over the picture. The buttons live in a `Client` of their own, so they keep working while the map redraws.
