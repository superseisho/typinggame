import type { AudioSettings } from '../../types/audio';
import type { SaveRepository } from './SaveRepository';

export async function loadAudioSettings(repository: SaveRepository): Promise<AudioSettings> {
  return (await repository.load()).settings.audio;
}

export async function saveAudioSettings(repository: SaveRepository, audio: AudioSettings): Promise<void> {
  const current = await repository.load();
  await repository.save({
    ...current,
    settings: { ...current.settings, audio },
  });
}
