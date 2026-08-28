import type { SaveData } from '../../types/save';
import { DEFAULT_AUDIO_SETTINGS } from '../../audio/audioConfig';

export function createDefaultSaveData(): SaveData {
  return {
    version: 1,
    ownedEquipment: [],
    equippedByCharacter: { warrior: {}, mage: {}, cleric: {}, 'martial-artist': {} },
    equippedRelicId: null,
    highestFloor: { easy: 0, normal: 0, hard: 0 },
    clearCounts: { easy: 0, normal: 0, hard: 0 },
    clearHistory: [],
    settings: { audio: DEFAULT_AUDIO_SETTINGS, reducedMotion: false },
    typingRecords: [],
  };
}
