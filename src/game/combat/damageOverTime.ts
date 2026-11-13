import type { CombatState } from '../../types/game';
import { resolveEnemyDamage } from './enemyDamage';

/** Schedule every due tick, including the one on expiry. No timers or on-ability procs. */
export function tickEnemyBurns(state: CombatState, deltaMs: number): CombatState {
  const ticks: { at: number; id: string; damage: number; actorId: string }[] = [];
  let next: CombatState = { ...state, enemies: state.enemies.map(e => {
    if (!e.burn || e.currentHp <= 0) return e.currentHp <= 0 ? { ...e, burn: null } : e;
    const burn = e.burn;
    const elapsed = Math.min(deltaMs, burn.remainingMs);
    let at = burn.untilTickMs;
    while (at <= elapsed) {
      ticks.push({ at, id: e.instanceId, damage: burn.damage, actorId: burn.actorId });
      at += burn.intervalMs;
    }
    return { ...e, burn: deltaMs >= burn.remainingMs ? null : { ...burn, remainingMs: burn.remainingMs - deltaMs, untilTickMs: at - elapsed } };
  }) };
  ticks.sort((a, b) => a.at - b.at);
  for (const tick of ticks) {
    if (!next.enemies.some(e => e.instanceId === tick.id && e.currentHp > 0)) continue;
    next = resolveEnemyDamage(next, { targetIds: [tick.id], power: tick.damage, kind: 'ally-ability-damage', label: 'Arcane Burn',
      abilityId: 'arcane-burn', actorId: tick.actorId, damageType: 'dot' });
  }
  return next;
}
