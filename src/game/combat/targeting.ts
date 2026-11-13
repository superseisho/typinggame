import { getEffectiveCharacter } from '../buffs/buffModifiers';
import type { CombatState } from '../../types/game';
import { getTargetedBuffValue } from '../buffs/buffModifiers';
import { randomStep } from '../../utils/random';

export function partyTargetWeight(state: CombatState, id: CombatState['party'][number]['definitionId']): number {
  return Math.max(.01, 1 + getTargetedBuffValue(state.runBuffs, 'target-weight-modifier', id));
}

/** Only random single-target attacks use this path. Guard and special AI resolve separately. */
export function selectRandomPartyTarget(state: CombatState): { state: CombatState; index: number | null } {
  const living = state.party.map((member, index) => ({ member, index })).filter(({ member }) => member.currentHp > 0);
  if (living.length <= 1) return { state, index: living[0]?.index ?? null };
  const random = randomStep(state.targetRngState);
  let roll = random.value * living.reduce((sum, { member }) => sum + partyTargetWeight(state, member.definitionId), 0);
  const target = living.find(({ member }) => (roll -= partyTargetWeight(state, member.definitionId)) < 0) ?? living[living.length - 1];
  return { state: { ...state, targetRngState: random.seed }, index: target.index };
}

export function selectLowestPartyHpIndex(state: CombatState): number | null {
  const living = state.party
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.currentHp > 0);
  if (living.length === 0) return null;
  return living.reduce((lowest, candidate) => {
    const lowestMax = getEffectiveCharacter(state, lowest.member.definitionId).stats.maxHp;
    const candidateMax = getEffectiveCharacter(state, candidate.member.definitionId).stats.maxHp;
    return candidate.member.currentHp / candidateMax < lowest.member.currentHp / lowestMax ? candidate : lowest;
  }).index;
}
