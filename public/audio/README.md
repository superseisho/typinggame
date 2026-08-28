# Audio asset overrides

The current MVP uses procedural Web Audio placeholders, so it does not require binary audio assets.

To replace a sound, place an audio file under `combat/`, `typing/`, `ui/`, or `bgm/`, then set the corresponding `src` field in `src/audio/audioConfig.ts`. For example:

```ts
warrior_attack: {
  // ...existing channel/cooldown settings
  src: '/audio/combat/warrior_attack.ogg',
}
```

When `src` is present, `AudioManager` uses the file. Without it, the procedural definition is used.
