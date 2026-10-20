import type { BuffCombatResources, BuffRarity } from '../../types/buffs';

export const BUFF_CONFIG = {
  choices: 3, acquisitionMs: 500, fallbackGold: 60,
  minAttackThreshold: 5, minAbilityThreshold: 5, minMissGaugeMultiplier: 0.1,
  unbrokenFocusRechargeMs: 30000,
  rarityWeights: {
    battle: { common: 40, uncommon: 30, rare: 19, epic: 8, legendary: 3 },
    elite: { common: 14, uncommon: 35, rare: 26, epic: 19, legendary: 6 },
  } satisfies Record<string, Record<BuffRarity, number>>,
} as const;
export const emptyBuffResources = (): BuffCombatResources => ({ counters: {}, shields: {}, gaugeShield: 0, focusRechargeMs: [] });
