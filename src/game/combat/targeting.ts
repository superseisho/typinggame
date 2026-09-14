import { getEffectiveCharacter } from '../buffs/buffModifiers';
import type { CombatState } from '../../types/game';

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
