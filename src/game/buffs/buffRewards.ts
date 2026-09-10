import { BUFF_DEFINITIONS } from '../../data/buffs/buffDefinitions';
import type { BuffRarity, RunBuff } from '../../types/buffs';
import { randomStep } from '../dungeon/roomGenerator';
import { BUFF_CONFIG } from './buffConfig';
import { canAddBuff } from './runBuffManager';

/** Rarity is drawn from non-empty pools, then a uniform definition from that pool. */
export function generateBuffRewards(buffs: readonly RunBuff[], room: string, seed: number) {
  let eligible = BUFF_DEFINITIONS.filter(buff => canAddBuff(buffs, buff.id));
  const choices: string[] = [];
  const weights = BUFF_CONFIG.rarityWeights[room === 'elite' || room === 'boss' ? 'elite' : 'battle'];
  while (choices.length < BUFF_CONFIG.choices && eligible.length) {
    const rarities = (Object.keys(weights) as BuffRarity[]).filter(rarity => eligible.some(buff => buff.rarity === rarity));
    let random = randomStep(seed); seed = random.seed;
    let roll = random.value * rarities.reduce((sum, rarity) => sum + weights[rarity], 0);
    const rarity = rarities.find(rarity => (roll -= weights[rarity]) < 0) ?? rarities[rarities.length - 1];
    const pool = eligible.filter(buff => buff.rarity === rarity);
    random = randomStep(seed); seed = random.seed;
    const chosen = pool[Math.floor(random.value * pool.length)];
    choices.push(chosen.id);
    eligible = eligible.filter(buff => buff.id !== chosen.id);
  }
  return { choices, seed };
}
