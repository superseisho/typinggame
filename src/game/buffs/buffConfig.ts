import type { BuffCombatResources, BuffRarity } from '../../types/buffs';

export const BUFF_CONFIG = {
  choices: 3, acquisitionMs: 500, fallbackGold: 60,
  minAttackThreshold: 5, minAbilityThreshold: 5, minMissGaugeMultiplier: 0.1,
  unbrokenFocusRechargeMs: 30000,
  rarityWeights: {
    battle: { common: 54, uncommon: 30, rare: 13, epic: 2, legendary: 1 },
    elite: { common: 18, uncommon: 40, rare: 30, epic: 10, legendary: 2 },
  } satisfies Record<string, Record<BuffRarity, number>>,
} as const;
export const emptyBuffResources = (): BuffCombatResources => ({ counters: {}, shields: {}, gaugeShield: 0, focusRechargeMs: [] });
