import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_SETTINGS } from '../../audio/audioConfig';
import { LocalStorageSaveRepository } from './LocalStorageSaveRepository';
import { loadAudioSettings, saveAudioSettings } from './audioSettingsStore';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('audio settings persistence', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('survives loading from a new repository instance', async () => {
    const first = new LocalStorageSaveRepository('audio-test');
    const changed = { ...DEFAULT_AUDIO_SETTINGS, masterVolume: .37, typingSeMuted: true };
    await saveAudioSettings(first, changed);
    const reloaded = await loadAudioSettings(new LocalStorageSaveRepository('audio-test'));
    expect(reloaded.masterVolume).toBe(.37);
    expect(reloaded.typingSeMuted).toBe(true);
  });
});
