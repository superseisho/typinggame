import type { SaveData } from '../../types/save';
import { createDefaultSaveData } from './defaultSaveData';
import type { SaveRepository } from './SaveRepository';

export class LocalStorageSaveRepository implements SaveRepository {
  constructor(private readonly storageKey = 'echoes-of-the-deep.save.v1') {}

  async load(): Promise<SaveData> {
    const raw = globalThis.localStorage?.getItem(this.storageKey);
    if (!raw) return createDefaultSaveData();
    try {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== 1 || !Array.isArray(parsed.typingRecords)) return createDefaultSaveData();
      const defaults = createDefaultSaveData();
      return {
        ...defaults,
        ...parsed,
        settings: {
          ...defaults.settings,
          ...parsed.settings,
          audio: {
            ...defaults.settings.audio,
            ...parsed.settings?.audio,
          },
        },
      } as SaveData;
    } catch {
      return createDefaultSaveData();
    }
  }

  async save(data: SaveData): Promise<void> {
    globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(data));
  }
}
