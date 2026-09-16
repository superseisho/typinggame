import { randomStep } from '../../utils/random';
import { ENEMY_ENCOUNTER_CONFIG, type RandomCombatSource } from './enemyEncounterConfig';

function weightedIndex(weights: readonly number[], roll: number): number {
  let remaining = roll * weights.reduce((sum, weight) => sum + weight, 0);
  return Math.max(0, weights.findIndex(weight => (remaining -= weight) < 0));
}

/** Called once on entry; each slot is an independent draw with replacement. */
export function generateEnemyEncounter(seed: number, source: RandomCombatSource, tier = 1) {
  const config = ENEMY_ENCOUNTER_CONFIG[tier]?.[source];
  if (!config?.pool.length) throw new Error(`No enemy pool for Tier ${tier}: ${source}`);
  let random = randomStep(seed);
  const count = weightedIndex(config.countWeights, random.value) + 1;
  const enemyIds: string[] = [];
  for (let slot = 0; slot < count; slot++) {
    random = randomStep(random.seed);
    enemyIds.push(config.pool[weightedIndex(config.pool.map(enemy => enemy.weight), random.value)].enemyId);
  }
  return { enemyIds, seed: random.seed };
}
