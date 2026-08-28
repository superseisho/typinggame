import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioSettings, SoundId } from '../types/audio';
import { LocalStorageSaveRepository } from '../game/save/LocalStorageSaveRepository';
import { loadAudioSettings, saveAudioSettings } from '../game/save/audioSettingsStore';
import { audioManager } from './AudioManager';

export function useAudioSettings() {
  const [settings, setSettings] = useState<AudioSettings>(audioManager.getSettings());
  const repository = useRef(new LocalStorageSaveRepository());

  useEffect(() => audioManager.subscribe(setSettings), []);

  useEffect(() => {
    let active = true;
    void loadAudioSettings(repository.current).then((loaded) => {
      if (active) audioManager.setSettings(loaded);
    });
    return () => { active = false; };
  }, []);

  const update = useCallback((partial: Partial<AudioSettings>) => {
    const next = { ...audioManager.getSettings(), ...partial };
    audioManager.setSettings(next);
    void saveAudioSettings(repository.current, next).catch((error: unknown) => {
      console.error('音量設定の保存に失敗しました', error);
    });
  }, []);

  const preview = useCallback((soundId: SoundId) => {
    void audioManager.unlock().then(() => audioManager.play(soundId));
  }, []);

  return { settings, update, preview };
}
