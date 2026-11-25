import { CHARACTERS_BY_ID } from '../../data/characters';
import { EXTRA_COMBO_STAGES } from '../../data/fighterComboStages';
import { BUFFS_BY_ID } from '../../data/buffs/buffDefinitions';
import { getTargetedBuffValue } from '../buffs/buffValues';
import type { CharacterId, CombatState } from '../../types/game';

export type ComboState = Pick<CombatState, 'runBuffs'> & Partial<Pick<CombatState, 'typing' | 'party'>>;

/** All combat consumers and UI derive stage from this same count and unlocked table. */
export function getComboView(state: ComboState, id: CharacterId) {
  const base = CHARACTERS_BY_ID[id];
  const trigger = base.ability.trigger;
  const effect = base.ability.effects.find(effect => effect.type === 'combo-attack-scaling');
  const stages = trigger.type === 'combo-milestones' && effect?.type === 'combo-attack-scaling'
    ? [...trigger.thresholds.map((threshold, i) => ({ threshold, multiplier: effect.multipliers[i] })),
      ...EXTRA_COMBO_STAGES.slice(0, getTargetedBuffValue(state.runBuffs, 'max-combo-stage-increase', id))] : [];
  const member = state.party?.find(p => p.definitionId === id);
  // Until the first Resilience miss the Fighter count equals the real typing streak.
  // Afterwards it is an explicit independent count; global Streak Buffs never read it.
  const count = member?.comboCorrectCount ?? state.typing?.currentCombo ?? 0;
  const stage = stages.filter(s => count >= s.threshold).length;
  return { count, stage, maxStage: stages.length, stages, multiplier: stage > 0 ? stages[stage - 1].multiplier : 1 };
}

export function getNormalAttackHitCount(state: ComboState, id: CharacterId): number {
  const stage = getComboView(state, id).stage;
  return 1 + state.runBuffs.reduce((sum, owned) => sum + (BUFFS_BY_ID[owned.buffId]?.effects ?? []).reduce((extra, effect) =>
    extra + (effect.type === 'combo-stage-multihit' && effect.target === id && stage >= effect.activationStage ? effect.value * owned.stacks : 0), 0), 0);
}
