import { CHARACTERS_BY_ID } from '../../data/characters';
import { ENEMIES_BY_ID } from '../../data/enemies';
import type { CharacterCombatState, CombatState } from '../../types/game';

export function getCharacterDefinition(character: CharacterCombatState) {
  return CHARACTERS_BY_ID[character.definitionId];
}

export function getEnemyDefinition(enemy: CombatState['enemies'][number]) {
  return ENEMIES_BY_ID[enemy.definitionId];
}

export function isPartyDefeated(party: CombatState['party']): boolean {
  return party.every((character) => character.currentHp <= 0);
}

export function getElapsedSeconds(state: CombatState, now = Date.now()): number {
  if (state.stats.startedAt === null) return 0;
  return Math.max(0, ((state.stats.endedAt ?? now) - state.stats.startedAt) / 1_000);
}

export function getAccuracy(state: CombatState): number {
  const total = state.typing.correctCharacterCount + state.typing.missCount;
  return total === 0 ? 100 : (state.typing.correctCharacterCount / total) * 100;
}

export function getWpm(state: CombatState, now = Date.now()): number {
  const minutes = getElapsedSeconds(state, now) / 60;
  return minutes <= 0 ? 0 : state.typing.correctCharacterCount / 5 / minutes;
}

export function areEnemiesDefeated(enemies: CombatState['enemies']): boolean {
  return enemies.every((enemy) => enemy.currentHp <= 0);
}
