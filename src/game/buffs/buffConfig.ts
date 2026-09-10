import type { BuffRarity } from '../../types/buffs';

export const BUFF_CONFIG = {
  choices: 3, acquisitionMs: 500, fallbackGold: 60,
  minAttackThreshold: 5, minAbilityThreshold: 5, minMissGaugeMultiplier: 0.1,
  rarityWeights: {
    battle: { common: 55, uncommon: 30, rare: 13, epic: 2 },
    elite: { common: 20, uncommon: 40, rare: 30, epic: 10 },
  } satisfies Record<string, Record<BuffRarity, number>>,
} as const;
export const emptyBuffResources = () => ({ counters: {}, shields: {}, gaugeShield: 0 });
