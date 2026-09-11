import type { TreasureOutcome } from '../../types/rooms';
import { randomStep } from './roomGenerator';
import { TREASURE_CONFIG } from './treasureConfig';

export function drawTreasure(seed: number) {
  const random = randomStep(seed);
  const entries = Object.entries(TREASURE_CONFIG.outcomeWeights) as [TreasureOutcome, number][];
  let roll = random.value * entries.reduce((sum, [, weight]) => sum + weight, 0);
  const outcome = entries.find(([, weight]) => (roll -= weight) < 0)![0];
  return { outcome, seed: random.seed };
}
