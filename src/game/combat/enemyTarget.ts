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

export type EnemyTargetDirection = 'left' | 'right';

/** EnemyPanel renders this array order. Persist IDs, never navigation indices. */
export function moveEnemyTarget(state: CombatState, direction: EnemyTargetDirection): CombatState {
  if (state.status !== 'active') return state;
  const alive = state.enemies.filter(enemy => enemy.currentHp > 0);
  if (!alive.length) return state;
  const current = alive.findIndex(enemy => enemy.instanceId === state.targetEnemyId);
  const next = current < 0 ? 0 : (current + (direction === 'right' ? 1 : -1) + alive.length) % alive.length;
  return selectEnemyTarget(state, alive[next].instanceId);
}
