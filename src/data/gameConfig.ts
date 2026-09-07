export const GAME_CONFIG = {
  firstEncounterEnemyIds: ['crypt-slime', 'grave-shaman'],
  combatLogLimit: 7,
  combatTickMs: 50,
  maxFrameDeltaMs: 250,
  enemySpecialGaugeOnMiss: 25,
  enemySpecialDelayMs: 750,
  combatEventHistoryLimit: 120,
  resurrectionHpRatio: 0.3,
} as const;

export const TRANSIENT_ABILITY_VISUAL_MS = 1_000;
