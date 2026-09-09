import type { CharacterId, Rarity } from './game';
import type { AudioSettings } from './audio';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type EquipmentSlot = 'weapon' | 'head' | 'body' | 'feet' | 'relic';

interface EquipmentBase {
  readonly instanceId: string;
  readonly definitionId: string;
  readonly name: string;
  readonly rarity: Rarity;
  readonly affixes: readonly { readonly stat: string; readonly value: number }[];
}

export type EquipmentInstance = EquipmentBase & (
  | { readonly slot: Exclude<EquipmentSlot, 'relic'>; readonly characterRestriction: CharacterId }
  | { readonly slot: 'relic'; readonly characterRestriction: null }
);

export interface TypingRecord {
  readonly playedAt: string;
  readonly result: 'victory' | 'defeat';
  readonly wpm: number;
  readonly accuracy: number;
  readonly correctCharacters: number;
  readonly misses: number;
  readonly maxCombo: number;
}

export interface SaveData {
  readonly version: 1;
  readonly ownedEquipment: readonly EquipmentInstance[];
  readonly equippedByCharacter: Readonly<Record<CharacterId, Partial<Record<Exclude<EquipmentSlot, 'relic'>, string>>>>;
  readonly equippedRelicId: string | null;
  readonly highestFloor: Readonly<Record<Difficulty, number>>;
  readonly clearCounts: Readonly<Record<Difficulty, number>>;
  readonly clearHistory: readonly { readonly difficulty: Difficulty; readonly clearedAt: string; readonly score: number; readonly maxFloor?: number }[];
  readonly settings: { readonly audio: AudioSettings; readonly reducedMotion: boolean };
  readonly typingRecords: readonly TypingRecord[];
}
