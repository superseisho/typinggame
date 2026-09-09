# Character portraits

Runtime portraits use one transparent PNG per visual state. There is no sprite
cropping or frame-position calculation in the UI.

Every character directory contains:

- `normal.png`
- `low-hp.png`
- `damaged.png` — standing, recoiling and wincing after a hit
- `low-hp-damaged.png` — weakened, kneeling/bracing after a hit
- `down.png`
- one character-specific active image, such as `guard-active.png`
- one combined low-HP active image, such as `low-hp-guard-active.png`

The exact paths are data-driven in `src/data/characters.ts`. Replacing an image
does not require a component or CSS change. Trigger-only portraits are not used.

The former `states.png` and `states-v2.png` sprite sheets were removed after
all runtime references were migrated. Keep future replacement art as one state
per file so neighboring poses can never bleed into the portrait viewport.

Damage portraits (8 files, 4 characters) were created with the built-in image
generation tool using each character's normal portrait as an identity reference.
The generated backgrounds needed cleanup; local background removal was explicitly
approved by the user. `scripts/prepare-damage-portrait.mjs` removes the neutral
background, supports inspected enclosed-background seeds, and exports alpha-aware
512px-high RGBA PNGs. It does not replace original portraits.

The shared damage cue controls pose + shake for `DAMAGE_PORTRAIT_DISPLAY_MS`
(250ms). Hit flash is 120ms on a separate layer. The `targetHpAfter` snapshot
selects normal/low-HP damage; after the cue, current HP/abilities determine the
return pose. Priority: Down > damage > persistent ability > instant ability >
low HP > normal. Full guard uses blue shield feedback, never a damage pose.

Run `npm run verify:portraits` to check all 28 individual PNG paths and alpha.
