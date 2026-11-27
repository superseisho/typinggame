import type { BuffRewardRerollState, DungeonRunState } from '../../types/dungeon';
import type { RarityWeights } from '../../types/encounters';
import { BUFF_CONFIG } from '../buffs/buffConfig';
import { TREASURE_CONFIG } from './treasureConfig';
import { getEncounter } from './encounterEngine';

export function createRewardReroll(weights: RarityWeights): BuffRewardRerollState {
  return { weights, count: BUFF_CONFIG.choices, revision: 0, freeRerollsUsed: 0 };
}

/** Legacy plain Run snapshots have no counters. Never guess Event random-outcome weights. */
export function rewardRerollState(run: DungeonRunState): BuffRewardRerollState | null {
  if (run.buffRewardReroll) return run.buffRewardReroll;
  if (run.currentRoom === 'event' || run.currentRoom === 'altar') {
    const choice = getEncounter(run)?.choices.find(choice => choice.id === run.encounter?.selectedChoiceId);
    const effect = choice?.effects.find(effect => effect.type === 'buff');
    return effect?.type === 'buff' ? createRewardReroll(effect.weights) : null;
  }
  return createRewardReroll(run.currentRoom === 'treasure'
    ? run.treasure?.outcome === 'rare_buff' ? TREASURE_CONFIG.rareBuffWeights : TREASURE_CONFIG.buffWeights
    : BUFF_CONFIG.rarityWeights[run.currentRoom === 'elite' || run.currentRoom === 'boss' ? 'elite' : 'battle']);
}
