import type { CombatState } from '../../types/game';

/** Extend the current cycle, never its planned skill or Special. Only Frost tracks a capped budget. */
export function delayEnemyAction(state: CombatState, instanceId: string, delayMs: number, frostLimitMs?: number): CombatState {
  const enemy = state.enemies.find(e => e.instanceId === instanceId && e.currentHp > 0);
  if (!enemy) return state;
  const delay = Math.max(0, frostLimitMs === undefined ? delayMs : Math.min(delayMs, frostLimitMs - enemy.pendingFrostDelayMs));
  if (delay <= 0) return state;
  return { ...state, enemies: state.enemies.map(e => e.instanceId === instanceId ? { ...e,
    pendingFrostDelayMs: e.pendingFrostDelayMs + (frostLimitMs === undefined ? 0 : delay),
    actionRemainingMs: e.actionRemainingMs + delay, actionDurationMs: e.actionDurationMs + delay,
  } : e) };
}
