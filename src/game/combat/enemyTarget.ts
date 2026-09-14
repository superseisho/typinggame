import type { CombatState } from '../../types/game';

/** Runtime ID is authoritative; array order is only the automatic fallback. */
export function resolveCurrentEnemyTarget(state: CombatState) {
  return state.enemies.find(enemy => enemy.instanceId === state.targetEnemyId && enemy.currentHp > 0)
    ?? state.enemies.find(enemy => enemy.currentHp > 0) ?? null;
}

export function ensureValidEnemyTarget(state: CombatState): CombatState {
  const id = state.status === 'victory' || state.status === 'defeat'
    ? null : resolveCurrentEnemyTarget(state)?.instanceId ?? null;
  return id === state.targetEnemyId ? state : { ...state, targetEnemyId: id };
}

export function selectEnemyTarget(state: CombatState, enemyId: string): CombatState {
  if (state.status !== 'active' || state.targetEnemyId === enemyId
    || !state.enemies.some(enemy => enemy.instanceId === enemyId && enemy.currentHp > 0)) return state;
  return { ...state, targetEnemyId: enemyId };
}
