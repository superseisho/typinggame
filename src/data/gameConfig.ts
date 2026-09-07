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
export const HEAL_FLASH_DURATION_MS = 380;

export const PORTRAIT_MOTION_DURATION_MS = {
  allyAttack: 260,
  enemyAttack: 280,
  allyDamaged: 300,
  enemyDamaged: 260,
  transientAbility: 700,
  persistentAbility: 320,
  enemySpecial: 720,
} as const;
