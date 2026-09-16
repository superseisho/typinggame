export type RandomCombatSource = 'battle' | 'elite' | 'ambush' | 'treasure_trap';
export interface WeightedEnemy { readonly enemyId: string; readonly weight: number }
const normalPool: readonly WeightedEnemy[] = [
  { enemyId: 'crypt-slime', weight: 25 },
  { enemyId: 'goblin-archer', weight: 25 },
  { enemyId: 'grave-shaman', weight: 10 },
  { enemyId: 'enemy_guardian', weight: 20 },
  { enemyId: 'enemy_shaman', weight: 20 },
];

/** Tier selects fixed definitions, never floor-scaled stats or fixed formations. */
export const ENEMY_ENCOUNTER_CONFIG: Readonly<Record<number, Readonly<Record<RandomCombatSource, {
  readonly countWeights: readonly number[]; readonly pool: readonly WeightedEnemy[];
}>>>> = {
  1: {
    battle: { countWeights: [30, 45, 25], pool: normalPool },
    ambush: { countWeights: [30, 45, 25], pool: normalPool },
    treasure_trap: { countWeights: [30, 45, 25], pool: normalPool },
    elite: { countWeights: [20, 45, 35], pool: [
      { enemyId: 'elite-slime', weight: 50 },
      { enemyId: 'enemy_guardian_elite', weight: 25 },
      { enemyId: 'enemy_shaman_elite', weight: 25 },
    ] },
  },
};
export const BOSS_ENCOUNTERS: Readonly<Record<number, readonly string[]>> = { 1: ['crypt-warden'] };
