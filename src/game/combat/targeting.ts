import { ENEMIES_BY_ID } from '../../data/enemies';
import { CHARACTERS_BY_ID } from '../../data/characters';
import type { CombatState, EnemyTargetRule } from '../../types/game';

export function selectEnemyTargetIndex(state: CombatState, rule: EnemyTargetRule): number | null {
  const living = state.enemies
    .map((enemy, index) => ({ enemy, index }))
    .filter(({ enemy }) => enemy.currentHp > 0);
  if (living.length === 0) return null;

  if (rule === 'round-robin') {
    return living[state.enemyTargetCursor % living.length].index;
  }
  if (rule === 'lowest-hp') {
    return living.reduce((lowest, candidate) => {
      const lowestDefinition = ENEMIES_BY_ID[lowest.enemy.definitionId];
      const candidateDefinition = ENEMIES_BY_ID[candidate.enemy.definitionId];
      return candidate.enemy.currentHp / candidateDefinition.maxHp < lowest.enemy.currentHp / lowestDefinition.maxHp
        ? candidate
        : lowest;
    }).index;
  }
  return living.reduce((front, candidate) =>
    candidate.enemy.formationIndex < front.enemy.formationIndex ? candidate : front
  ).index;
}

export function selectLowestPartyHpIndex(state: CombatState): number | null {
  const living = state.party
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.currentHp > 0);
  if (living.length === 0) return null;
  return living.reduce((lowest, candidate) => {
    const lowestMax = CHARACTERS_BY_ID[lowest.member.definitionId].stats.maxHp;
    const candidateMax = CHARACTERS_BY_ID[candidate.member.definitionId].stats.maxHp;
    return candidate.member.currentHp / candidateMax < lowest.member.currentHp / lowestMax ? candidate : lowest;
  }).index;
}
