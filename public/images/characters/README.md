# Character portraits

Runtime portraits use one transparent PNG per visual state. There is no sprite
cropping or frame-position calculation in the UI.

Every character directory contains:

- `normal.png`
- `low-hp.png`
- `down.png`
- one character-specific active image, such as `guard-active.png`
- one combined low-HP active image, such as `low-hp-guard-active.png`

The exact paths are data-driven in `src/data/characters.ts`. Replacing an image
does not require a component or CSS change. Trigger-only portraits are not used.

The former `states.png` and `states-v2.png` sprite sheets were removed after
all runtime references were migrated. Keep future replacement art as one state
per file so neighboring poses can never bleed into the portrait viewport.
